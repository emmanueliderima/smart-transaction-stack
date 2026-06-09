import { PublicKey } from "@solana/web3.js";
import { type Commitment } from "@solana/web3.js";

// ─── Jito Tip Accounts (Mainnet) ──────────────────────────────────────────────
// These 8 accounts are the official hardcoded mainnet tip accounts per Jito docs.
// Source: https://docs.jito.wtf/lowlatencytxnsend/#gettipaccounts
export const JITO_TIP_ACCOUNTS_MAINNET = [
  "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
  "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
  "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
  "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
  "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
  "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
  "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
].map((addr) => new PublicKey(addr));

// ─── Jito Block Engine URLs ───────────────────────────────────────────────────
// Source: https://docs.jito.wtf/lowlatencytxnsend/#api
export const JITO_BLOCK_ENGINE_URLS = {
  mainnet: {
    global:     "https://mainnet.block-engine.jito.wtf",
    amsterdam:  "https://amsterdam.mainnet.block-engine.jito.wtf",
    dublin:     "https://dublin.mainnet.block-engine.jito.wtf",
    frankfurt:  "https://frankfurt.mainnet.block-engine.jito.wtf",
    london:     "https://london.mainnet.block-engine.jito.wtf",
    ny:         "https://ny.mainnet.block-engine.jito.wtf",
    slc:        "https://slc.mainnet.block-engine.jito.wtf",
    singapore:  "https://singapore.mainnet.block-engine.jito.wtf",
    tokyo:      "https://tokyo.mainnet.block-engine.jito.wtf",
  },
  testnet: {
    global: "https://testnet.block-engine.jito.wtf",
    dallas: "https://dallas.testnet.block-engine.jito.wtf",
    ny:     "https://ny.testnet.block-engine.jito.wtf",
  },
};

// ─── Jito Bundle API URLs ─────────────────────────────────────────────────────
// Used for fetching tip floor data
export const JITO_BUNDLE_API_URLS = {
  mainnet: "https://bundles.jito.wtf/api/v1",
  testnet: "https://bundles.testnet.jito.wtf/api/v1",
};

// ─── Jito Tip Floor Endpoints ─────────────────────────────────────────────────
// GET these endpoints for recent landed tip percentiles
export const JITO_TIP_FLOOR_URLS = {
  mainnet: "https://bundles.jito.wtf/api/v1/bundles/tip_floor",
  testnet: "https://bundles.testnet.jito.wtf/api/v1/bundles/tip_floor",
};

// ─── Solana RPC URLs ──────────────────────────────────────────────────────────
export const SOLANA_RPC_URLS = {
  mainnet: "https://api.mainnet-beta.solana.com",
  testnet: "https://api.testnet.solana.com",
};

// ─── Commitment Levels ────────────────────────────────────────────────────────
export const COMMITMENT_LEVELS: Commitment[] = [
  "processed",
  "confirmed",
  "finalized",
];

// ─── Tip Configuration ────────────────────────────────────────────────────────
export const TIP_CONFIG = {
  // Minimum tip in lamports — enforced by Jito (confirmed in docs)
  MIN_TIP_LAMPORTS: 1_000,
  // Maximum tip in lamports (0.01 SOL) — safety ceiling
  MAX_TIP_LAMPORTS: 10_000_000,
  // Default percentile to pull from tip floor data
  DEFAULT_PERCENTILE: 50,
  // Lamports per SOL
  LAMPORTS_PER_SOL: 1_000_000_000,
};

// ─── Transaction Config ───────────────────────────────────────────────────────
export const TX_CONFIG = {
  // Actual blockhash expiry is ~150 slots; we refresh at 100 to be safe
  BLOCKHASH_STALE_SLOTS: 100,
  // Max retry attempts before giving up
  MAX_RETRIES: 5,
  // How many slots ahead of the Jito leader window to submit
  LEADER_LOOKAHEAD_SLOTS: 2,
  // Max transactions per bundle (hard Jito limit)
  MAX_BUNDLE_TXS: 5,
};

// ─── Failure Types ────────────────────────────────────────────────────────────
export enum FailureType {
  EXPIRED_BLOCKHASH  = "EXPIRED_BLOCKHASH",
  FEE_TOO_LOW        = "FEE_TOO_LOW",
  COMPUTE_EXCEEDED   = "COMPUTE_EXCEEDED",
  BUNDLE_DROPPED     = "BUNDLE_DROPPED",
  LEADER_SKIPPED     = "LEADER_SKIPPED",
  SIMULATION_FAILED  = "SIMULATION_FAILED",
  NETWORK_ERROR      = "NETWORK_ERROR",
  UNKNOWN            = "UNKNOWN",
}

// ─── Lifecycle Stages ─────────────────────────────────────────────────────────
export enum LifecycleStage {
  SUBMITTED  = "SUBMITTED",
  PROCESSED  = "PROCESSED",
  CONFIRMED  = "CONFIRMED",
  FINALIZED  = "FINALIZED",
  FAILED     = "FAILED",
}

// ─── Active Network ───────────────────────────────────────────────────────────
export const NETWORK = (process.env.NETWORK as "mainnet" | "testnet") ?? "mainnet";

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Returns the tip accounts for the active network.
 * Mainnet accounts are hardcoded (stable, per Jito docs).
 * Testnet accounts should be fetched dynamically via getTipAccounts()
 * on the block engine — see bundleBuilder.ts.
 */
export const getTipAccounts = () => JITO_TIP_ACCOUNTS_MAINNET;

/** Pick a random tip account to distribute load */
export const getRandomTipAccount = () => {
  const accounts = getTipAccounts();
  return accounts[Math.floor(Math.random() * accounts.length)];
};

export const getBlockEngineUrl = () =>
  process.env.JITO_BLOCK_ENGINE_URL ??
  (NETWORK === "mainnet"
    ? JITO_BLOCK_ENGINE_URLS.mainnet.ny
    : JITO_BLOCK_ENGINE_URLS.testnet.dallas);

export const getJitoBundleApiUrl = () =>
  NETWORK === "mainnet"
    ? JITO_BUNDLE_API_URLS.mainnet
    : JITO_BUNDLE_API_URLS.testnet;

export const getTipFloorUrl = () =>
  NETWORK === "mainnet"
    ? JITO_TIP_FLOOR_URLS.mainnet
    : JITO_TIP_FLOOR_URLS.testnet;

export const getSolanaRpcUrl = () =>
  process.env.SOLANA_RPC_URL ??
  (NETWORK === "mainnet"
    ? SOLANA_RPC_URLS.mainnet
    : SOLANA_RPC_URLS.testnet);