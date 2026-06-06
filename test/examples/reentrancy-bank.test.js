import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

describe("Example: VulnerableBank single-function reentrancy", function () {
  it("should drain the bank using withdraw() reentry", async function () {
    const [owner, victim] = await ethers.getSigners();

    const Bank = await ethers.getContractFactory("VulnerableBank");
    const bank = await Bank.deploy();
    await bank.waitForDeployment();

    const AttackerFactory = await ethers.getContractFactory("Attacker");
    const attacker = await AttackerFactory.deploy(await bank.getAddress());
    await attacker.waitForDeployment();

    await bank.connect(victim).deposit({ value: ethers.parseEther("5") });

    console.log("Bank before:", ethers.formatEther(await ethers.provider.getBalance(await bank.getAddress())));
    console.log("Attacker before:", ethers.formatEther(await ethers.provider.getBalance(await attacker.getAddress())));

    await attacker.connect(owner).attack({ value: ethers.parseEther("1") });

    console.log("Bank after:", ethers.formatEther(await ethers.provider.getBalance(await bank.getAddress())));
    console.log("Attacker after:", ethers.formatEther(await ethers.provider.getBalance(await attacker.getAddress())));

    expect(await ethers.provider.getBalance(await bank.getAddress())).to.equal(0n);
    expect(await ethers.provider.getBalance(await attacker.getAddress())).to.equal(
      ethers.parseEther("6")
    );
  });
});
