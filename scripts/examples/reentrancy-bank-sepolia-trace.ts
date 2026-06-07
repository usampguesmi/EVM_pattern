import "dotenv/config";
import { network } from "hardhat";
import { writeFileSync, mkdirSync } from "fs";

// Run: npx hardhat run scripts/examples/reentrancy-bank-sepolia-trace.ts
//
// Two-phase approach:
//   PHASE 1 — Deploys contracts + runs attack on Sepolia.
//             Everything is on-chain: visible on Etherscan.
//   PHASE 2 — Replays the exact same attack on a local Hardhat EDR node
//             using the same bytecode and same ETH amounts.
//             Captures the opcode trace via debug_traceTransaction.
//             (Alchemy free tier does not expose the debug namespace;
//              the local EDR exposes it fully and for free.)
//
// Why the local trace equals the Sepolia trace:
//   EVM opcodes are determined solely by bytecode + calldata + initial state.
//   The network (Sepolia vs local) changes only block/chain metadata
//   (CHAINID, BLOCKHASH, COINBASE, TIMESTAMP, NUMBER) — not the contract
//   logic, storage layout, or call sequence. For reentrancy analysis
//   the opcode sequence is identical.

const VICTIM_DEPOSIT = "0.05"; // ETH — adjust if balance is very low
const ATTACK_ETH     = "0.05"; // must equal ATTACK_AMOUNT constant in Attacker.sol
const CONFIRMS       = 2;

const etherscan = (path: string) => `https://sepolia.etherscan.io/${path}`;

function hexStackTop(stack: string[] | undefined): string {
  if (!stack || stack.length === 0) return "";
  const raw = stack[stack.length - 1];
  try { return BigInt(raw.startsWith("0x") ? raw : "0x" + raw).toString(10); }
  catch { return ""; }
}

// TXSpector format uses post-execution stack top.
// Geth/EDR structLogs record pre-execution state, so log[i]'s post-state
// equals log[i+1]'s pre-state (when at the same call depth).
function formatTxSpectorTrace(logs: any[]): string {
  return logs
    .map((log, i) => {
      const next = logs[i + 1];
      const afterStack = next && next.depth === log.depth ? next.stack : log.stack;
      return `${log.pc};${log.op};${hexStackTop(afterStack)}`;
    })
    .join("\n");
}

// ═══════════════════════════════════════════════════════════════════
//  PHASE 1 — Sepolia  (on-chain visibility, Etherscan links)
// ═══════════════════════════════════════════════════════════════════
console.log("═══════════════════════════════════════════════════════");
console.log("  PHASE 1 — Sepolia");
console.log("═══════════════════════════════════════════════════════\n");

const sepoliaConn = await network.create("sepolia");
const sep = sepoliaConn.ethers;
const [signer] = await sep.getSigners();
const balance = await sep.provider.getBalance(signer.address);

console.log(`Signer  : ${signer.address}`);
console.log(`Balance : ${sep.formatEther(balance)} ETH\n`);

const MIN_BALANCE = sep.parseEther("0.11");
if (balance < MIN_BALANCE) {
  console.error(`Balance too low. Need at least 0.11 Sepolia ETH.`);
  console.error(`Get some at: https://sepoliafaucet.com (${signer.address})`);
  console.error(`Or: https://www.alchemy.com/faucets/ethereum-sepolia`);
  process.exit(1);
}

// ── deploy VulnerableBank ─────────────────────────────────────────
console.log("Deploying VulnerableBank...");
const BankF = await sep.getContractFactory(
  "contracts/examples/reentrancy-bank/VulnerableBank.sol:VulnerableBank"
);
const bank = (await BankF.deploy()) as any;
console.log(`  deploy tx : ${etherscan(`tx/${bank.deploymentTransaction()!.hash}`)}`);
await bank.waitForDeployment();
const bankAddress = await bank.getAddress();
console.log(`  contract  : ${etherscan(`address/${bankAddress}`)}\n`);

// ── deploy Attacker ───────────────────────────────────────────────
console.log("Deploying Attacker...");
const AttF = await sep.getContractFactory(
  "contracts/examples/reentrancy-bank/Attacker.sol:Attacker"
);
const attacker = (await AttF.deploy(bankAddress)) as any;
console.log(`  deploy tx : ${etherscan(`tx/${attacker.deploymentTransaction()!.hash}`)}`);
await attacker.waitForDeployment();
const attackerAddress = await attacker.getAddress();
console.log(`  contract  : ${etherscan(`address/${attackerAddress}`)}\n`);

// ── victim deposits ───────────────────────────────────────────────
console.log(`Victim depositing ${VICTIM_DEPOSIT} ETH...`);
const depositTx = await bank.deposit({ value: sep.parseEther(VICTIM_DEPOSIT) });
console.log(`  tx : ${etherscan(`tx/${depositTx.hash}`)}`);
await depositTx.wait(CONFIRMS);
const bankBefore = await sep.provider.getBalance(bankAddress);
console.log(`  Bank balance : ${sep.formatEther(bankBefore)} ETH\n`);

// ── attack ────────────────────────────────────────────────────────
console.log("Launching reentrancy attack...");
const attackTx = await attacker.attack({ value: sep.parseEther(ATTACK_ETH) });
const attackTxHash = attackTx.hash;
console.log(`  ATTACK TX : ${etherscan(`tx/${attackTxHash}`)}`);
const attackReceipt = await attackTx.wait(CONFIRMS);
const attackBlock   = attackReceipt!.blockNumber;
console.log(`  Block     : ${attackBlock}`);

const bankAfter = await sep.provider.getBalance(bankAddress);
console.log(`  Bank after : ${sep.formatEther(bankAfter)} ETH`);
console.log(`  Drained    : ${bankAfter === 0n}\n`);

// ═══════════════════════════════════════════════════════════════════
//  PHASE 2 — Local Hardhat EDR  (opcode trace)
// ═══════════════════════════════════════════════════════════════════
console.log("═══════════════════════════════════════════════════════");
console.log("  PHASE 2 — Local trace (same bytecode, same params)");
console.log("═══════════════════════════════════════════════════════\n");

const localConn = await network.create("hardhatMainnet");
const loc = localConn.ethers;
const locProvider = localConn.provider;

const [locVictim, locAttackerEOA] = await loc.getSigners();

const LocBankF = await loc.getContractFactory(
  "contracts/examples/reentrancy-bank/VulnerableBank.sol:VulnerableBank"
);
const locBank = (await (await LocBankF.deploy()).waitForDeployment()) as any;

const LocAttF = await loc.getContractFactory(
  "contracts/examples/reentrancy-bank/Attacker.sol:Attacker"
);
const locAtt = (await (await LocAttF.deploy(await locBank.getAddress())).waitForDeployment()) as any;

// same amounts as Sepolia
await (await locBank.connect(locVictim).deposit({ value: loc.parseEther(VICTIM_DEPOSIT) })).wait();
const locReceipt = await (await locAtt.connect(locAttackerEOA).attack({ value: loc.parseEther(ATTACK_ETH) })).wait();

const locBankAfter = await loc.provider.getBalance(await locBank.getAddress());
console.log(`Local bank after attack: ${loc.formatEther(locBankAfter)} ETH`);

// ── fetch trace ───────────────────────────────────────────────────
console.log("Fetching opcode trace...");
const traceResult: any = await locProvider.request({
  method: "debug_traceTransaction",
  params: [
    locReceipt!.hash,
    { disableMemory: true, disableStack: false, disableStorage: true },
  ],
});

const structLogs: any[] = traceResult.structLogs;
const traceText = formatTxSpectorTrace(structLogs);

mkdirSync("./traces", { recursive: true });
const outputFile = `./traces/sepolia_${attackTxHash.slice(0, 10)}.txt`;
writeFileSync(outputFile, traceText);

// ── summary ───────────────────────────────────────────────────────
console.log(`\n═══════════════════════════════════════════════════════`);
console.log(`  Summary`);
console.log(`═══════════════════════════════════════════════════════`);
console.log(`VulnerableBank : ${etherscan(`address/${bankAddress}`)}`);
console.log(`Attacker       : ${etherscan(`address/${attackerAddress}`)}`);
console.log(`Attack TX      : ${etherscan(`tx/${attackTxHash}`)}`);
console.log(`Attack Block   : ${attackBlock}`);
console.log(`Trace file     : ${outputFile}`);
console.log(`Opcode steps   : ${structLogs.length}`);
