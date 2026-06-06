import { ethers } from "hardhat";

async function main() {
  const [deployer, victim] = await ethers.getSigners();

  const VaultFactory = await ethers.getContractFactory("SimpleVault");
  const vault = await VaultFactory.deploy();
  await vault.waitForDeployment();

  const AttackerFactory = await ethers.getContractFactory("VaultAttacker");
  const attacker = await AttackerFactory.deploy(await vault.getAddress());
  await attacker.waitForDeployment();

  await vault.connect(victim).deposit({ value: ethers.parseEther("1") });

  console.log("Vault balance before:", ethers.formatEther(await ethers.provider.getBalance(await vault.getAddress())));
  console.log("Attacker balance before:", ethers.formatEther(await ethers.provider.getBalance(await attacker.getAddress())));

  await attacker.connect(deployer).attack({ value: ethers.parseEther("0.1") });

  console.log("Vault balance after:", ethers.formatEther(await ethers.provider.getBalance(await vault.getAddress())));
  console.log("Attacker balance after:", ethers.formatEther(await ethers.provider.getBalance(await attacker.getAddress())));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
