import "dotenv/config";
import { network } from "hardhat";
import { writeFileSync, mkdirSync } from "fs";

// Run: npx hardhat run scripts/examples/reentrancy-vault-sepolia-trace.ts
//
// SimpleVault + VaultAttacker — ATTACK_AMOUNT = 0.1 ETH (hardcoded in contract)
// Needs at least 0.22 Sepolia ETH in wallet.

const VICTIM_DEPOSIT = "0.1"; // must be >= ATTACK_AMOUNT for reentrancy to loop
const ATTACK_ETH     = "0.1"; // must equal VaultAttacker.ATTACK_AMOUNT constant
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
console.log("  PHASE 1 — Sepolia  [SimpleVault + VaultAttacker]");
console.log("═══════════════════════════════════════════════════════\n");

const sepoliaConn = await network.create("sepolia");
const sep = sepoliaConn.ethers;
const [signer] = await sep.getSigners();
const balance = await sep.provider.getBalance(signer.address);

console.log(`Signer  : ${signer.address}`);
console.log(`Balance : ${sep.formatEther(balance)} ETH\n`);

if (balance < sep.parseEther("0.22")) {
  console.error("Need at least 0.22 Sepolia ETH (VaultAttacker.ATTACK_AMOUNT = 0.1 ETH).");
  console.error(`Faucet: https://sepoliafaucet.com  (${signer.address})`);
  process.exit(1);
}

// ── deploy SimpleVault ────────────────────────────────────────────
console.log("Deploying SimpleVault...");
const VaultF = await sep.getContractFactory(
  "contracts/examples/reentrancy-vault/SimpleVault.sol:SimpleVault"
);
const vault = (await VaultF.deploy()) as any;
console.log(`  deploy tx : ${etherscan(`tx/${vault.deploymentTransaction()!.hash}`)}`);
await vault.waitForDeployment();
const vaultAddress = await vault.getAddress();
console.log(`  contract  : ${etherscan(`address/${vaultAddress}`)}\n`);

// ── deploy VaultAttacker ──────────────────────────────────────────
console.log("Deploying VaultAttacker...");
const AttF = await sep.getContractFactory(
  "contracts/examples/reentrancy-vault/VaultAttacker.sol:VaultAttacker"
);
const attacker = (await AttF.deploy(vaultAddress)) as any;
console.log(`  deploy tx : ${etherscan(`tx/${attacker.deploymentTransaction()!.hash}`)}`);
await attacker.waitForDeployment();
const attackerAddress = await attacker.getAddress();
console.log(`  contract  : ${etherscan(`address/${attackerAddress}`)}\n`);

// ── victim deposits ───────────────────────────────────────────────
console.log(`Victim depositing ${VICTIM_DEPOSIT} ETH...`);
const depositTx = await vault.deposit({ value: sep.parseEther(VICTIM_DEPOSIT) });
console.log(`  tx : ${etherscan(`tx/${depositTx.hash}`)}`);
await depositTx.wait(CONFIRMS);
console.log(`  Vault balance : ${sep.formatEther(await sep.provider.getBalance(vaultAddress))} ETH\n`);

// ── attack ────────────────────────────────────────────────────────
console.log("Launching reentrancy attack...");
const attackTx = await attacker.attack({ value: sep.parseEther(ATTACK_ETH) });
const attackTxHash = attackTx.hash;
console.log(`  ATTACK TX : ${etherscan(`tx/${attackTxHash}`)}`);
const receipt = await attackTx.wait(CONFIRMS);
const attackBlock = receipt!.blockNumber;
console.log(`  Block     : ${attackBlock}`);
const vaultAfter = await sep.provider.getBalance(vaultAddress);
console.log(`  Vault after : ${sep.formatEther(vaultAfter)} ETH`);
console.log(`  Drained     : ${vaultAfter === 0n}\n`);

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

const LocVaultF = await loc.getContractFactory(
  "contracts/examples/reentrancy-vault/SimpleVault.sol:SimpleVault"
);
const locVault = (await (await LocVaultF.deploy()).waitForDeployment()) as any;

const LocAttF = await loc.getContractFactory(
  "contracts/examples/reentrancy-vault/VaultAttacker.sol:VaultAttacker"
);
const locAtt = (await (await LocAttF.deploy(await locVault.getAddress())).waitForDeployment()) as any;

await (await locVault.connect(locVictim).deposit({ value: loc.parseEther(VICTIM_DEPOSIT) })).wait();
const locReceipt = await (await locAtt.connect(locAttackerEOA).attack({ value: loc.parseEther(ATTACK_ETH) })).wait();

const locVaultAfter = await loc.provider.getBalance(await locVault.getAddress());
console.log(`Local vault after attack: ${loc.formatEther(locVaultAfter)} ETH`);

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
const outputFile = `./traces/sepolia_vault_${attackTxHash.slice(0, 10)}.txt`;
writeFileSync(outputFile, traceText);

// ── report ────────────────────────────────────────────────────────
console.log(`\n═══════════════════════════════════════════════════════`);
console.log(`  Summary`);
console.log(`═══════════════════════════════════════════════════════`);
console.log(`SimpleVault    : ${etherscan(`address/${vaultAddress}`)}`);
console.log(`VaultAttacker  : ${etherscan(`address/${attackerAddress}`)}`);
console.log(`Attack TX      : ${etherscan(`tx/${attackTxHash}`)}`);
console.log(`Attack Block   : ${attackBlock}`);
console.log(`Trace file     : ${outputFile}`);
console.log(`Opcode steps   : ${structLogs.length}`);

// ── report file ───────────────────────────────────────────────────
const reportFile = `./traces/sepolia_vault_${attackTxHash.slice(0, 10)}_report.md`;
writeFileSync(reportFile, `# Reentrancy Attack — Vault — Sepolia

## Contracts

| Contract     | Address                                    |
|--------------|--------------------------------------------|
| SimpleVault  | ${vaultAddress}                            |
| VaultAttacker | ${attackerAddress}                        |

## Transactions

| Event         | TX Hash                  |
|---------------|--------------------------|
| Victim deposit | ${depositTx.hash}       |
| Attack TX      | ${attackTxHash}          |

- **Attack block:** ${attackBlock}
- **Vault drained:** ${vaultAfter === 0n}
- **Victim deposit:** ${VICTIM_DEPOSIT} ETH
- **Attack amount:** ${ATTACK_ETH} ETH

## Etherscan Links

- SimpleVault: ${etherscan(`address/${vaultAddress}`)}
- VaultAttacker: ${etherscan(`address/${attackerAddress}`)}
- Victim deposit tx: ${etherscan(`tx/${depositTx.hash}`)}
- Attack tx: ${etherscan(`tx/${attackTxHash}`)}

## Trace

- **File:** ${outputFile}
- **Opcode steps:** ${structLogs.length}
- **Format:** TXSpector — \`<pc>;<opcode>;<stack_top_decimal>\`
`);
console.log(`Report saved    : ${reportFile}`);
