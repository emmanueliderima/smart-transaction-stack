import "dotenv/config";
import Client, {
  CommitmentLevel,
  SubscribeRequestFilterSlots,
} from "@triton-one/yellowstone-grpc";
import { Connection } from "@solana/web3.js";
import { TX_CONFIG, getSolanaRpcUrl } from "../config/constants";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SlotInfo {
  slot: number;
  parent: number;
  status: "processed" | "confirmed" | "rooted";
  timestamp: Date;
}

export interface LeaderWindow {
  validator: string;
  startSlot: number;
  endSlot: number;
  isJitoValidator: boolean;
}

export interface NetworkState {
  currentSlot: number;
  currentLeader: string | null;
  nextJitoLeaderSlot: number | null;
  slotsUntilNextJitoLeader: number | null;
  isHealthy: boolean;
  lastUpdated: Date;
}

type SlotUpdateCallback = (state: NetworkState) => void;

// ─── Network Monitor ──────────────────────────────────────────────────────────

export class NetworkMonitor {
  private client: Client;
  private connection: Connection;
  private state: NetworkState;
  private leaderSchedule: Map<number, string> = new Map();
  private jitoValidators: Set<string> = new Set();
  private callbacks: SlotUpdateCallback[] = [];
  private isRunning = false;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly RECONNECT_DELAY_MS = 2_000;
  private stream: any = null;

  constructor() {
    this.client = new Client(
        process.env.YELLOWSTONE_GRPC_URL!,
        process.env.YELLOWSTONE_TOKEN,
        {}
    );

    this.connection = new Connection(getSolanaRpcUrl(), {
      commitment: "confirmed",
    });

    this.state = {
      currentSlot: 0,
      currentLeader: null,
      nextJitoLeaderSlot: null,
      slotsUntilNextJitoLeader: null,
      isHealthy: false,
      lastUpdated: new Date(),
    };
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /** Start the monitor. Fetches leader schedule then opens the slot stream. */
  async start(): Promise<void> {
    console.log("[NetworkMonitor] Starting...");
    await this.fetchLeaderSchedule();
    // Hard requirement — must know Jito validators before streaming
    await this.fetchJitoValidators();
    await this.connectStream();
  }

  /** Stop the monitor and close the stream. */
  async stop(): Promise<void> {
    console.log("[NetworkMonitor] Stopping...");
    this.isRunning = false;
    if (this.stream) {
      this.stream.cancel();
      this.stream = null;
    }
  }

  /** Register a callback to be called on every slot update. */
  onSlotUpdate(cb: SlotUpdateCallback): void {
    this.callbacks.push(cb);
  }

  /** Returns a snapshot of the current network state. */
  getState(): NetworkState {
    return { ...this.state };
  }

  /**
   * Returns true when conditions are favorable for submission:
   * - A confirmed Jito leader is within LEADER_LOOKAHEAD_SLOTS
   * - Network is healthy
   */
  isReadyToSubmit(): boolean {
    const { slotsUntilNextJitoLeader, isHealthy } = this.state;
    if (!isHealthy) return false;
    if (slotsUntilNextJitoLeader === null) return false;
    return slotsUntilNextJitoLeader <= TX_CONFIG.LEADER_LOOKAHEAD_SLOTS;
  }

  /**
   * Waits until conditions are favorable for submission.
   * Resolves with the current network state when ready.
   */
  waitUntilReady(): Promise<NetworkState> {
    return new Promise((resolve) => {
      if (this.isReadyToSubmit()) {
        resolve(this.getState());
        return;
      }

      const check = (state: NetworkState) => {
        if (this.isReadyToSubmit()) {
          this.callbacks = this.callbacks.filter((cb) => cb !== check);
          resolve(state);
        }
      };

      this.callbacks.push(check);
    });
  }

  // ─── Leader Schedule ────────────────────────────────────────────────────────

  private async fetchLeaderSchedule(): Promise<void> {
    console.log("[NetworkMonitor] Fetching leader schedule...");
    try {
      const schedule = await this.connection.getLeaderSchedule();
      if (!schedule) {
        console.warn("[NetworkMonitor] No leader schedule returned");
        return;
      }

      this.leaderSchedule.clear();

      for (const [validator, slots] of Object.entries(schedule)) {
        for (const slot of slots) {
          this.leaderSchedule.set(slot, validator);
        }
      }

      console.log(
        `[NetworkMonitor] Leader schedule loaded: ${this.leaderSchedule.size} slots`
      );
    } catch (err) {
      console.error("[NetworkMonitor] Failed to fetch leader schedule:", err);
    }
  }

  /**
   * Fetches the Jito validator set from the block engine.
   * Retries up to 5 times then throws — this is a hard requirement.
   * We must never submit without knowing which leaders are Jito-compatible.
   */
  private async fetchJitoValidators(): Promise<void> {
    console.log("[NetworkMonitor] Fetching Jito validator set...");

    const MAX_RETRIES = 5;
    const RETRY_DELAY_MS = 3_000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const url = `${process.env.JITO_BLOCK_ENGINE_URL}/api/v1/validators`;
        const res = await fetch(url);

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const data = (await res.json()) as { validators: string[] };

        if (!data.validators || data.validators.length === 0) {
          throw new Error("Empty validator list returned");
        }

        this.jitoValidators = new Set(data.validators);
        console.log(
          `[NetworkMonitor] Loaded ${this.jitoValidators.size} Jito validators`
        );
        return;
      } catch (err) {
        console.warn(
          `[NetworkMonitor] Failed to fetch Jito validators ` +
            `(attempt ${attempt}/${MAX_RETRIES}):`,
          err
        );

        if (attempt < MAX_RETRIES) {
          console.log(`[NetworkMonitor] Retrying in ${RETRY_DELAY_MS}ms...`);
          await new Promise((res) => setTimeout(res, RETRY_DELAY_MS));
        } else {
          throw new Error(
            `[NetworkMonitor] Could not fetch Jito validator list after ` +
              `${MAX_RETRIES} attempts. Cannot proceed without knowing which ` +
              `leaders are Jito-compatible. Check JITO_BLOCK_ENGINE_URL in .env.`
          );
        }
      }
    }
  }

  // ─── Slot Stream ────────────────────────────────────────────────────────────

  private async connectStream(): Promise<void> {
    this.isRunning = true;
    this.reconnectAttempts = 0;
    await this.openStream();
  }

  private async openStream(): Promise<void> {
    console.log("[NetworkMonitor] Opening Yellowstone slot stream...");

    try {
      const stream = await this.client.subscribe();
      this.stream = stream;

      const request = {
        slots: {
          client: {
            filterByCommitment: true,
          } as SubscribeRequestFilterSlots,
        },
        accounts: {},
        transactions: {},
        transactionsStatus: {},
        blocks: {},
        blocksMeta: {},
        entry: {},
        commitment: CommitmentLevel.PROCESSED,
        accountsDataSlice: [],
        ping: undefined,
      };

      await new Promise<void>((resolve, reject) => {
        stream.write(request, (err: Error | null | undefined) => {
          if (err) reject(err);
          else resolve();
        });
      });

      console.log("[NetworkMonitor] Slot stream active");
      this.reconnectAttempts = 0;

      stream.on("data", (data: any) => {
        if (data?.slot) {
          this.handleSlotUpdate(data.slot);
        }
      });

      stream.on("error", (err: Error) => {
        console.error("[NetworkMonitor] Stream error:", err.message);
        this.handleDisconnect();
      });

      stream.on("end", () => {
        console.warn("[NetworkMonitor] Stream ended");
        this.handleDisconnect();
      });
    } catch (err) {
      console.error("[NetworkMonitor] Failed to open stream:", err);
      this.handleDisconnect();
    }
  }

  private handleSlotUpdate(slotData: any): void {
    const slot = Number(slotData.slot);

    if (slot <= this.state.currentSlot) return;

    this.state.currentSlot = slot;
    this.state.lastUpdated = new Date();

    const leader = this.leaderSchedule.get(slot) ?? null;
    this.state.currentLeader = leader;

    this.updateNextJitoLeader(slot);

    this.state.isHealthy = true;

    for (const cb of this.callbacks) {
      try {
        cb({ ...this.state });
      } catch (err) {
        console.error("[NetworkMonitor] Callback error:", err);
      }
    }

    if (process.env.LOG_LEVEL === "debug") {
      console.log(
        `[NetworkMonitor] Slot ${slot} | Leader: ${leader ?? "unknown"} | ` +
          `Next Jito: ${this.state.nextJitoLeaderSlot ?? "unknown"} ` +
          `(in ${this.state.slotsUntilNextJitoLeader ?? "?"} slots)`
      );
    }
  }

  private updateNextJitoLeader(currentSlot: number): void {
    const LOOKAHEAD = 100;

    for (let s = currentSlot + 1; s <= currentSlot + LOOKAHEAD; s++) {
      const validator = this.leaderSchedule.get(s);
      if (!validator) continue;

      // Strict check — only mark as Jito if confirmed in the validator set
      if (this.jitoValidators.has(validator)) {
        this.state.nextJitoLeaderSlot = s;
        this.state.slotsUntilNextJitoLeader = s - currentSlot;
        return;
      }
    }

    // No confirmed Jito leader found in lookahead window
    this.state.nextJitoLeaderSlot = null;
    this.state.slotsUntilNextJitoLeader = null;
  }

  // ─── Reconnection ─────────────────────────────────────────────────────────

  private handleDisconnect(): void {
    if (!this.isRunning) return;

    this.state.isHealthy = false;
    this.reconnectAttempts++;

    if (this.reconnectAttempts > this.MAX_RECONNECT_ATTEMPTS) {
      console.error(
        `[NetworkMonitor] Max reconnect attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`
      );
      this.isRunning = false;
      return;
    }

    const delay = this.RECONNECT_DELAY_MS * this.reconnectAttempts;
    console.log(
      `[NetworkMonitor] Reconnecting in ${delay}ms ` +
        `(attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})...`
    );

    setTimeout(async () => {
      if (!this.isRunning) return;
      await this.fetchLeaderSchedule();
      await this.openStream();
    }, delay);
  }
}