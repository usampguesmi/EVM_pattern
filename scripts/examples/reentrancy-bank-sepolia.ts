import { ethers } from "hardhat";

// Run: npx hardhat run scripts/examples/reentrancy-bank-sepolia.ts --network sepolia
// Required .env: SEPOLIA_RPC_URL, PRIVATE_KEY

const VICTIM_DEPOSIT = ethers.parseEther("0.1");  // keep small on testnet
const ATTACK_ETH     = ethers.parseEther("0.05"); // must match ATTACK_AMOUNT in Attacker.sol
const CONFIRMS       = 2;

function etherscan(path: string) {
  return `https://sepolia.etherscan.io/${path}`;
}

async function main() {
  const [signer] = await ethers.getSigners();

  console.log("═══════════════════════════════════════════════");
  console.log("  Reentrancy-Bank demo — Sepolia");
  console.log("═══════════════════════════════════════════════");
  console.log(`Signer  : ${signer.address}`);
  console.log(`Balance : ${ethers.formatEther(await ethers.provider.getBalance(signer.address))} ETH\n`);

  // ── 1. Deploy VulnerableBank ───────────────────────────────────────────────
  console.log("Deploying VulnerableBank...");
  const BankFactory = await ethers.getContractFactory("VulnerableBank");
  const bank = await BankFactory.deploy();
  const bankDeployTx = bank.deploymentTransaction()!;
  console.log(`  tx   : ${etherscan(`tx/${bankDeployTx.hash}`)}`);
  await bank.waitForDeployment();
  const bankAddress = await bank.getAddress();
  console.log(`  addr : ${etherscan(`address/${bankAddress}`)}\n`);

  // ── 2. Deploy Attacker ─────────────────────────────────────────────────────
  console.log("Deploying Attacker...");
  const AttackerFactory = await ethers.getContractFactory("Attacker");
  const attacker = await AttackerFactory.deploy(bankAddress);
  const attackerDeployTx = attacker.deploymentTransaction()!;
  console.log(`  tx   : ${etherscan(`tx/${attackerDeployTx.hash}`)}`);
  await attacker.waitForDeployment();
  const attackerAddress = await attacker.getAddress();
  console.log(`  addr : ${etherscan(`address/${attackerAddress}`)}\n`);

  // ── 3. Victim deposits ETH ─────────────────────────────────────────────────
  console.log(`Victim depositing ${ethers.formatEther(VICTIM_DEPOSIT)} ETH into VulnerableBank...`);
  const depositTx = await bank.deposit({ value: VICTIM_DEPOSIT });
  console.log(`  tx   : ${etherscan(`tx/${depositTx.hash}`)}`);
  await depositTx.wait(CONFIRMS);
  console.log("  Confirmed.\n");

  // ── 4. Balances before attack ──────────────────────────────────────────────
  console.log("── Balances before attack ──────────────────────");
  console.log(`  Bank     : ${ethers.formatEther(await ethers.provider.getBalance(bankAddress))} ETH`);
  console.log(`  Attacker : ${ethers.formatEther(await ethers.provider.getBalance(attackerAddress))} ETH`);
  console.log(`  Signer   : ${ethers.formatEther(await ethers.provider.getBalance(signer.address))} ETH\n`);

  // ── 5. Launch reentrancy attack ────────────────────────────────────────────
  console.log("Launching reentrancy attack...");
  const attackTx = await attacker.attack({ value: ATTACK_ETH });
  console.log(`  tx   : ${etherscan(`tx/${attackTx.hash}`)}`);
  await attackTx.wait(CONFIRMS);
  console.log("  Confirmed.\n");

  // ── 6. Balances after attack ───────────────────────────────────────────────
  console.log("── Balances after attack ───────────────────────");
  console.log(`  Bank     : ${ethers.formatEther(await ethers.provider.getBalance(bankAddress))} ETH`);
  console.log(`  Attacker : ${ethers.formatEther(await ethers.provider.getBalance(attackerAddress))} ETH`);
  console.log(`  Signer   : ${ethers.formatEther(await ethers.provider.getBalance(signer.address))} ETH\n`);

  const drained = (await ethers.provider.getBalance(bankAddress)) === 0n;
  console.log(`Bank drained: ${drained}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
