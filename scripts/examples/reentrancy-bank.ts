import { ethers } from "hardhat";

async function main() {
  const [deployer, victim] = await ethers.getSigners();

  const BankFactory = await ethers.getContractFactory("VulnerableBank");
  const bank = await BankFactory.deploy();
  await bank.waitForDeployment();

  const AttackerFactory = await ethers.getContractFactory("Attacker");
  const attacker = await AttackerFactory.deploy(await bank.getAddress());
  await attacker.waitForDeployment();

  await bank.connect(victim).deposit({ value: ethers.parseEther("5") });

  console.log("Bank balance before:", ethers.formatEther(await ethers.provider.getBalance(await bank.getAddress())));
  console.log("Attacker balance before:", ethers.formatEther(await ethers.provider.getBalance(await attacker.getAddress())));

  await attacker.connect(deployer).attack({ value: ethers.parseEther("1") });

  console.log("Bank balance after:", ethers.formatEther(await ethers.provider.getBalance(await bank.getAddress())));
  console.log("Attacker balance after:", ethers.formatEther(await ethers.provider.getBalance(await attacker.getAddress())));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
