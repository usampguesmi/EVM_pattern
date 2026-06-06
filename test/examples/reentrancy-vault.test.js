import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

describe("Example: SimpleVault single-function reentrancy", function () {
  it("should drain the vault with recursive withdraw", async function () {
    const [owner, victim, attackerEOA] = await ethers.getSigners();

    const Vault = await ethers.getContractFactory("SimpleVault");
    const vault = await Vault.deploy();
    await vault.waitForDeployment();

    const Attacker = await ethers.getContractFactory("VaultAttacker");
    const attacker = await Attacker.deploy(await vault.getAddress());
    await attacker.waitForDeployment();

    await vault.connect(victim).deposit({ value: ethers.parseEther("1") });

    await attacker.connect(owner).attack({ value: ethers.parseEther("0.1") });

    expect(await ethers.provider.getBalance(await vault.getAddress())).to.equal(0n);
    expect(await ethers.provider.getBalance(await attacker.getAddress())).to.equal(ethers.parseEther("1.1"));
  });
});
