import { ethers } from "hardhat";

// Run: npx hardhat run scripts/examples/reentrancy-bank-geth.ts --network localGeth
// Required .env: LOCAL_GETH_RPC_URL, LOCAL_GETH_PRIVATE_KEY
//
// Start Geth first:
//   geth --dev --http --http.api eth,net,web3 --http.port 8545

const VICTIM_DEPOSIT = ethers.parseEther("5");    // local node — free funds
const ATTACK_ETH     = ethers.parseEther("0.05"); // must match ATTACK_AMOUNT in Attacker.sol

async function main() {
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  // Use a second signer as victim if the node provides multiple accounts (--dev does)
  const victim = signers[1] ?? signers[0];

  console.log("═══════════════════════════════════════════════");
  console.log("  Reentrancy-Bank demo — local Geth");
  console.log("═══════════════════════════════════════════════");
  console.log(`Deployer : ${deployer.address}`);
  console.log(`Victim   : ${victim.address}`);
  console.log(`Deployer balance : ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
  console.log(`Victim balance   : ${ethers.formatEther(await ethers.provider.getBalance(victim.address))} ETH\n`);

  // ── 1. Deploy VulnerableBank ───────────────────────────────────────────────
  console.log("Deploying VulnerableBank...");
  const BankFactory = await ethers.getContractFactory("VulnerableBank");
  const bank = await BankFactory.deploy();
  await bank.waitForDeployment();
  const bankAddress = await bank.getAddress();
  console.log(`  addr : ${bankAddress}\n`);

  // ── 2. Deploy Attacker ─────────────────────────────────────────────────────
  console.log("Deploying Attacker...");
  const AttackerFactory = await ethers.getContractFactory("Attacker");
  const attacker = await AttackerFactory.deploy(bankAddress);
  await attacker.waitForDeployment();
  const attackerAddress = await attacker.getAddress();
  console.log(`  addr : ${attackerAddress}\n`);

  // ── 3. Victim deposits ETH ─────────────────────────────────────────────────
  console.log(`Victim depositing ${ethers.formatEther(VICTIM_DEPOSIT)} ETH into VulnerableBank...`);
  const depositTx = await bank.connect(victim).deposit({ value: VICTIM_DEPOSIT });
  await depositTx.wait();
  console.log(`  tx : ${depositTx.hash}\n`);

  // ── 4. Balances before attack ──────────────────────────────────────────────
  console.log("── Balances before attack ──────────────────────");
  console.log(`  Bank     : ${ethers.formatEther(await ethers.provider.getBalance(bankAddress))} ETH`);
  console.log(`  Attacker : ${ethers.formatEther(await ethers.provider.getBalance(attackerAddress))} ETH`);
  console.log(`  Deployer : ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
  console.log(`  Victim   : ${ethers.formatEther(await ethers.provider.getBalance(victim.address))} ETH\n`);

  // ── 5. Launch reentrancy attack ────────────────────────────────────────────
  console.log("Launching reentrancy attack...");
  const attackTx = await attacker.connect(deployer).attack({ value: ATTACK_ETH });
  await attackTx.wait();
  console.log(`  tx : ${attackTx.hash}\n`);

  // ── 6. Balances after attack ───────────────────────────────────────────────
  console.log("── Balances after attack ───────────────────────");
  console.log(`  Bank     : ${ethers.formatEther(await ethers.provider.getBalance(bankAddress))} ETH`);
  console.log(`  Attacker : ${ethers.formatEther(await ethers.provider.getBalance(attackerAddress))} ETH`);
  console.log(`  Deployer : ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
  console.log(`  Victim   : ${ethers.formatEther(await ethers.provider.getBalance(victim.address))} ETH\n`);

  const drained = (await ethers.provider.getBalance(bankAddress)) === 0n;
  console.log(`Bank drained: ${drained}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
