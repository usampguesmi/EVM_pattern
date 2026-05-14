import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

describe("Single-function reentrancy attack", function () {
  let bank, attacker;
  let victim, attackerEOA;

  it("should drain the vulnerable bank", async function () {
    [victim, attackerEOA] = await ethers.getSigners();

    const Bank = await ethers.getContractFactory("VulnerableBank");
    bank = await Bank.deploy();
    await bank.waitForDeployment();

    const Attacker = await ethers.getContractFactory("Attacker");
    attacker = await Attacker.deploy(await bank.getAddress());
    await attacker.waitForDeployment();

    await bank.connect(victim).deposit({
      value: ethers.parseEther("5"),
    });

    console.log("Bank before:", ethers.formatEther(await ethers.provider.getBalance(await bank.getAddress())));
    console.log("Attacker before:", ethers.formatEther(await ethers.provider.getBalance(await attacker.getAddress())));

    await attacker.connect(attackerEOA).attack({
      value: ethers.parseEther("1"),
    });

    console.log("Bank after:", ethers.formatEther(await ethers.provider.getBalance(await bank.getAddress())));
    console.log("Attacker after:", ethers.formatEther(await ethers.provider.getBalance(await attacker.getAddress())));

    expect(await ethers.provider.getBalance(await bank.getAddress())).to.equal(0n);
    expect(await ethers.provider.getBalance(await attacker.getAddress())).to.equal(
      ethers.parseEther("6")
    );
  });
});