import "dotenv/config";
import { network } from "hardhat";
import { writeFileSync, mkdirSync } from "fs";

// Run: npx hardhat run scripts/examples/reentrancy-pool-sepolia-trace.ts
//
// ReentrancyPool + PoolAttacker — ATTACK_AMOUNT = 0.05 ETH (hardcoded in contract)
// Needs at least 0.11 Sepolia ETH in wallet.

const VICTIM_DEPOSIT = "0.05"; // must be >= ATTACK_AMOUNT for reentrancy to loop
const ATTACK_ETH     = "0.05"; // must equal PoolAttacker.ATTACK_AMOUNT constant
const CONFIRMS       = 2;

const etherscan = (path: string) => `https://sepolia.etherscan.io/${path}`;

function hexStackTop(stack: string[] | undefined): string {
  if (!stack || stack.length === 0) return "";
  const raw = stack[stack.length - 1];
  try { return BigInt(raw.startsWith("0x") ? raw : "0x" + raw).toString(10); }
  catch { return ""; }
}

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
//  PHASE 1 — Sepolia
// ═══════════════════════════════════════════════════════════════════
console.log("═══════════════════════════════════════════════════════");
console.log("  PHASE 1 — Sepolia  [ReentrancyPool + PoolAttacker]");
console.log("═══════════════════════════════════════════════════════\n");

const sepoliaConn = await network.create("sepolia");
const sep = sepoliaConn.ethers;
const [signer] = await sep.getSigners();
const balance = await sep.provider.getBalance(signer.address);

console.log(`Signer  : ${signer.address}`);
console.log(`Balance : ${sep.formatEther(balance)} ETH\n`);

if (balance < sep.parseEther("0.11")) {
  console.error("Need at least 0.11 Sepolia ETH.");
  console.error(`Faucet: https://sepoliafaucet.com  (${signer.address})`);
  process.exit(1);
}

// ── deploy ReentrancyPool ─────────────────────────────────────────
console.log("Deploying ReentrancyPool...");
const PoolF = await sep.getContractFactory(
  "contracts/examples/reentrancy-pool/ReentrancyPool.sol:ReentrancyPool"
);
const pool = (await PoolF.deploy()) as any;
console.log(`  deploy tx : ${etherscan(`tx/${pool.deploymentTransaction()!.hash}`)}`);
await pool.waitForDeployment();
const poolAddress = await pool.getAddress();
console.log(`  contract  : ${etherscan(`address/${poolAddress}`)}\n`);

// ── deploy PoolAttacker ───────────────────────────────────────────
console.log("Deploying PoolAttacker...");
const AttF = await sep.getContractFactory(
  "contracts/examples/reentrancy-pool/PoolAttacker.sol:PoolAttacker"
);
const attacker = (await AttF.deploy(poolAddress)) as any;
console.log(`  deploy tx : ${etherscan(`tx/${attacker.deploymentTransaction()!.hash}`)}`);
await attacker.waitForDeployment();
const attackerAddress = await attacker.getAddress();
console.log(`  contract  : ${etherscan(`address/${attackerAddress}`)}\n`);

// ── victim contributes ────────────────────────────────────────────
console.log(`Victim contributing ${VICTIM_DEPOSIT} ETH...`);
const contributeTx = await pool.contribute({ value: sep.parseEther(VICTIM_DEPOSIT) });
console.log(`  tx : ${etherscan(`tx/${contributeTx.hash}`)}`);
await contributeTx.wait(CONFIRMS);
console.log(`  Pool balance : ${sep.formatEther(await sep.provider.getBalance(poolAddress))} ETH\n`);

// ── attack ────────────────────────────────────────────────────────
console.log("Launching reentrancy attack...");
const attackTx = await attacker.attack({ value: sep.parseEther(ATTACK_ETH) });
const attackTxHash = attackTx.hash;
console.log(`  ATTACK TX : ${etherscan(`tx/${attackTxHash}`)}`);
const receipt = await attackTx.wait(CONFIRMS);
const attackBlock = receipt!.blockNumber;
console.log(`  Block     : ${attackBlock}`);
const poolAfter = await sep.provider.getBalance(poolAddress);
console.log(`  Pool after : ${sep.formatEther(poolAfter)} ETH`);
console.log(`  Drained    : ${poolAfter === 0n}\n`);

// ═══════════════════════════════════════════════════════════════════
//  PHASE 2 — Local trace
// ═══════════════════════════════════════════════════════════════════
console.log("═══════════════════════════════════════════════════════");
console.log("  PHASE 2 — Local trace (same bytecode, same params)");
console.log("═══════════════════════════════════════════════════════\n");

const localConn = await network.create("hardhatMainnet");
const loc = localConn.ethers;
const locProvider = localConn.provider;

const [locVictim, locAttackerEOA] = await loc.getSigners();

const LocPoolF = await loc.getContractFactory(
  "contracts/examples/reentrancy-pool/ReentrancyPool.sol:ReentrancyPool"
);
const locPool = (await (await LocPoolF.deploy()).waitForDeployment()) as any;

const LocAttF = await loc.getContractFactory(
  "contracts/examples/reentrancy-pool/PoolAttacker.sol:PoolAttacker"
);
const locAtt = (await (await LocAttF.deploy(await locPool.getAddress())).waitForDeployment()) as any;

await (await locPool.connect(locVictim).contribute({ value: loc.parseEther(VICTIM_DEPOSIT) })).wait();
const locReceipt = await (await locAtt.connect(locAttackerEOA).attack({ value: loc.parseEther(ATTACK_ETH) })).wait();

const locPoolAfter = await loc.provider.getBalance(await locPool.getAddress());
console.log(`Local pool after attack: ${loc.formatEther(locPoolAfter)} ETH`);

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
const outputFile = `./traces/sepolia_pool_${attackTxHash.slice(0, 10)}.txt`;
writeFileSync(outputFile, traceText);

// ── report ────────────────────────────────────────────────────────
console.log(`\n═══════════════════════════════════════════════════════`);
console.log(`  Summary`);
console.log(`═══════════════════════════════════════════════════════`);
console.log(`ReentrancyPool : ${etherscan(`address/${poolAddress}`)}`);
console.log(`PoolAttacker   : ${etherscan(`address/${attackerAddress}`)}`);
console.log(`Attack TX      : ${etherscan(`tx/${attackTxHash}`)}`);
console.log(`Attack Block   : ${attackBlock}`);
console.log(`Trace file     : ${outputFile}`);
console.log(`Opcode steps   : ${structLogs.length}`);

// ── report file ───────────────────────────────────────────────────
const reportFile = `./traces/sepolia_pool_${attackTxHash.slice(0, 10)}_report.md`;
writeFileSync(reportFile, `# Reentrancy Attack — Pool — Sepolia

## Contracts

| Contract      | Address                                    |
|---------------|--------------------------------------------|
| ReentrancyPool | ${poolAddress}                            |
| PoolAttacker  | ${attackerAddress}                         |

## Transactions

| Event            | TX Hash                  |
|------------------|--------------------------|
| Victim contribute | ${contributeTx.hash}    |
| Attack TX         | ${attackTxHash}          |

- **Attack block:** ${attackBlock}
- **Pool drained:** ${poolAfter === 0n}
- **Victim deposit:** ${VICTIM_DEPOSIT} ETH
- **Attack amount:** ${ATTACK_ETH} ETH

## Etherscan Links

- ReentrancyPool: ${etherscan(`address/${poolAddress}`)}
- PoolAttacker: ${etherscan(`address/${attackerAddress}`)}
- Victim contribute tx: ${etherscan(`tx/${contributeTx.hash}`)}
- Attack tx: ${etherscan(`tx/${attackTxHash}`)}

## Trace

- **File:** ${outputFile}
- **Opcode steps:** ${structLogs.length}
- **Format:** TXSpector — \`<pc>;<opcode>;<stack_top_decimal>\`
`);
console.log(`Report saved    : ${reportFile}`);
