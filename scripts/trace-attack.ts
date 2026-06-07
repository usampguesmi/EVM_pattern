import "dotenv/config";
import { network } from "hardhat";
import { writeFileSync, mkdirSync } from "fs";

// network.create() returns NetworkConnection; provider is EthereumProvider with .send()
const connection = await network.create();
const { ethers } = connection;
const { provider } = connection;

// ── 1. Deploy contracts ───────────────────────────────────────────────────────
const [victim, attackerEOA] = await ethers.getSigners();

const Bank = await ethers.getContractFactory(
  "contracts/examples/reentrancy-bank/VulnerableBank.sol:VulnerableBank"
);
// cast to any: no typechain types generated, BaseContract lacks ABI-specific methods
const bank = (await Bank.deploy()) as any;
await bank.waitForDeployment();
const bankAddress = await bank.getAddress();

const AttackerFactory = await ethers.getContractFactory(
  "contracts/examples/reentrancy-bank/Attacker.sol:Attacker"
);
const attacker = (await AttackerFactory.deploy(bankAddress)) as any;
await attacker.waitForDeployment();
const attackerAddress = await attacker.getAddress();

console.log(`VulnerableBank : ${bankAddress}`);
console.log(`Attacker       : ${attackerAddress}`);

// ── 2. Victim deposits so the bank has a balance to drain ─────────────────────
const depositTx = await bank.connect(victim).deposit({ value: ethers.parseEther("5") });
await depositTx.wait();

console.log(`Bank balance before: ${ethers.formatEther(await ethers.provider.getBalance(bankAddress))} ETH`);

// ── 3. Execute the attack and capture the tx hash ─────────────────────────────
const ATTACK_AMOUNT = ethers.parseEther("1");
const attackTx = await attacker.connect(attackerEOA).attack({ value: ATTACK_AMOUNT });
const receipt = await attackTx.wait();
const txHash = receipt!.hash;

console.log(`Attack tx hash : ${txHash}`);
console.log(`Bank balance after : ${ethers.formatEther(await ethers.provider.getBalance(bankAddress))} ETH`);

// ── 4. Retrieve opcode-level trace via debug_traceTransaction ─────────────────
//
// Hardhat EDR (v3) supports the standard Geth debug_traceTransaction endpoint.
// structLogs: Array<{ pc, op, gas, gasCost, depth, stack: string[], memory, storage }>
//   stack entries are 32-byte hex strings (no 0x prefix), top of stack = last element
//   depth increments on each CALL/DELEGATECALL/etc.
//
const traceResult: any = await provider.request({
  method: "debug_traceTransaction",
  params: [txHash, { disableMemory: false, disableStack: false, disableStorage: false }],
});

const structLogs: any[] = traceResult.structLogs;
console.log(`Captured ${structLogs.length} opcode steps`);

// ── 5. Format as TXSpector opcode-level trace ─────────────────────────────────
//
// Format per line:  <pc>;<opcode>;<top_of_stack_as_decimal>
//
// TXSpector records the stack state AFTER each instruction executes.
// EDR's structLogs record it BEFORE. The post-execution stack for instruction[i]
// equals the pre-execution stack of instruction[i+1], provided both are at the
// same call depth (i.e. no CALL/RETURN boundary between them).
// At depth boundaries (CALL enters, RETURN/STOP exits) we fall back to the
// pre-execution stack of the instruction itself.
//
function hexStackTop(stack: string[] | undefined): string {
  if (!stack || stack.length === 0) return "";
  const raw = stack[stack.length - 1];
  return BigInt(raw.startsWith("0x") ? raw : "0x" + raw).toString(10);
}

function formatTxSpectorTrace(logs: any[]): string {
  return logs
    .map((log, i) => {
      const next = logs[i + 1];
      // use next log's pre-state (= this log's post-state) when same depth
      const afterStack = next && next.depth === log.depth ? next.stack : log.stack;
      return `${log.pc};${log.op};${hexStackTop(afterStack)}`;
    })
    .join("\n");
}

const traceText = formatTxSpectorTrace(structLogs);

// ── 6. Save trace to a file ───────────────────────────────────────────────────
mkdirSync("./traces", { recursive: true });
const outputPath = `./traces/trace_${txHash.slice(0, 10)}.txt`;
writeFileSync(outputPath, traceText);
console.log(`Trace written to ${outputPath}`);

// ── 7. (Optional) Save trace to MongoDB ──────────────────────────────────────
//
// Run first:  npm install mongodb
// Add to .env:  MONGODB_URI=mongodb://localhost:27017
//
const MONGODB_URI = process.env.MONGODB_URI;
if (MONGODB_URI) {
  // @ts-ignore — install mongodb package to resolve: npm install mongodb
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(MONGODB_URI);
  await client.connect();

  const db = client.db(process.env.MONGODB_DB ?? "txspector");
  const col = db.collection(process.env.MONGODB_COLLECTION ?? "traces");

  // flat TXSpector text + full struct-log array (stack/memory/storage per step)
  await col.insertOne({
    txHash,
    blockNumber: receipt!.blockNumber,
    contractAddress: attackerAddress,
    targetAddress: bankAddress,
    network: "hardhat-local",
    capturedAt: new Date(),
    txspectorTrace: traceText,
    structLogs,
  });

  await client.close();
  console.log(`Trace saved to MongoDB collection '${process.env.MONGODB_COLLECTION ?? "traces"}'`);
}
