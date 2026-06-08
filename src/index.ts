import "dotenv/config";

console.log("Solinfra starting...");
console.log(`   Network : ${process.env.NETWORK ?? "devnet"}`);
console.log(`   RPC     : ${process.env.SOLANA_RPC_URL}`);
console.log(`   Jito    : ${process.env.JITO_BLOCK_ENGINE_URL}`);