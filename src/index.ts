import "dotenv/config";
import { NetworkMonitor } from "./monitor/network-monitor";

const monitor = new NetworkMonitor();

// Log every slot update
monitor.onSlotUpdate((state: { currentSlot: any; currentLeader: any; slotsUntilNextJitoLeader: any; isHealthy: any; }) => {
  console.log(
    `[Slot ${state.currentSlot}] Leader: ${state.currentLeader ?? "unknown"} | ` +
    `Next Jito in: ${state.slotsUntilNextJitoLeader ?? "?"} slots | ` +
    `Healthy: ${state.isHealthy}`
  );
});

await monitor.start();

// Test waitUntilReady
console.log("\n[Main] Waiting for a favorable submission window...");
const readyState = await monitor.waitUntilReady();
console.log("[Main] Ready to submit!", readyState);

// Keep running
process.on("SIGINT", async () => {
  console.log("\n[Main] Shutting down...");
  await monitor.stop();
  process.exit(0);
});