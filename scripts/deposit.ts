import "dotenv/config";
import "@nomicfoundation/hardhat-ethers";
import { network } from "hardhat";

const VULNERABLE_BANK_ADDRESS = process.env.VULNERABLE_BANK_ADDRESS ?? "";
const DEPOSIT_AMOUNT = "0.1"; // ETH — enough for the attacker to drain

const { ethers } = await network.create();
const [signer] = await ethers.getSigners();

if (!VULNERABLE_BANK_ADDRESS) {
  throw new Error("Set VULNERABLE_BANK_ADDRESS in .env");
}

const bank = await ethers.getContractAt("VulnerableBank", VULNERABLE_BANK_ADDRESS);

const signerBalanceBefore = await ethers.provider.getBalance(signer.address);
console.log(`Signer:          ${signer.address}`);
console.log(`Signer balance:  ${ethers.formatEther(signerBalanceBefore)} ETH`);
console.log(`Depositing:      ${DEPOSIT_AMOUNT} ETH into VulnerableBank...`);

const tx = await bank.deposit({ value: ethers.parseEther(DEPOSIT_AMOUNT) });
await tx.wait();

const bankBalance = await bank.getBalance();
const signerDeposit = await bank.getBalanceOf(signer.address);

console.log(`\nDone! tx: ${tx.hash}`);
console.log(`VulnerableBank balance : ${ethers.formatEther(bankBalance)} ETH`);
console.log(`Your recorded deposit  : ${ethers.formatEther(signerDeposit)} ETH`);
