import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

describe("Example: ReentrancyPool single-function reentrancy", function () {
  it("should drain the pool using collect() reentry", async function () {
    const [owner, victim, attackerEOA] = await ethers.getSigners();

    const Pool = await ethers.getContractFactory("ReentrancyPool");
    const pool = await Pool.deploy();
    await pool.waitForDeployment();

    const Attacker = await ethers.getContractFactory("PoolAttacker");
    const attacker = await Attacker.deploy(await pool.getAddress());
    await attacker.waitForDeployment();

    await pool.connect(victim).contribute({ value: ethers.parseEther("0.8") });

    await attacker.connect(owner).attack({ value: ethers.parseEther("0.05") });

    expect(await ethers.provider.getBalance(await pool.getAddress())).to.equal(0n);
    expect(await ethers.provider.getBalance(await attacker.getAddress())).to.equal(ethers.parseEther("0.85"));
  });
});
