import "dotenv/config";
import "@nomicfoundation/hardhat-ethers";
import { network } from "hardhat";
import type { HardhatEthers } from "@nomicfoundation/hardhat-ethers/types";

const VULNERABLE_BANK_ADDRESS = process.env.VULNERABLE_BANK_ADDRESS ?? "";
const ATTACKER_ADDRESS = process.env.ATTACKER_ADDRESS ?? "";

// ── helpers ──────────────────────────────────────────────────────────────────

export async function getContracts(ethers: HardhatEthers) {
  if (!VULNERABLE_BANK_ADDRESS || !ATTACKER_ADDRESS) {
    throw new Error(
      "Set VULNERABLE_BANK_ADDRESS and ATTACKER_ADDRESS in .env first"
    );
  }
  const bank = await ethers.getContractAt(
    "VulnerableBank",
    VULNERABLE_BANK_ADDRESS
  );
  const attacker = await ethers.getContractAt("Attacker", ATTACKER_ADDRESS);
  return { bank, attacker };
}

export async function checkBalances(
  ethers: HardhatEthers,
  signerAddress?: string
) {
  const { bank, attacker } = await getContracts(ethers);

  const bankEth = await ethers.provider.getBalance(VULNERABLE_BANK_ADDRESS);
  const attackerEth = await ethers.provider.getBalance(ATTACKER_ADDRESS);

  const bankInternal = await bank.getBalance();

  const signerDeposit = signerAddress
    ? await bank.getBalanceOf(signerAddress)
    : 0n;

  const attackerInternal = await attacker.getBalance();

  console.log("\n══════════════════════════════════════════");
  console.log("  CONTRACT BALANCES");
  console.log("══════════════════════════════════════════");

  console.log(`\nVulnerableBank  ${VULNERABLE_BANK_ADDRESS}`);
  console.log(`  ETH on-chain   : ${ethers.formatEther(bankEth)} ETH`);
  console.log(`  getBalance()   : ${ethers.formatEther(bankInternal)} ETH`);
  if (signerAddress) {
    console.log(
      `  Your deposit   : ${ethers.formatEther(signerDeposit)} ETH  (${signerAddress})`
    );
  }

  console.log(`\nAttacker        ${ATTACKER_ADDRESS}`);
  console.log(`  ETH on-chain   : ${ethers.formatEther(attackerEth)} ETH`);
  console.log(`  getBalance()   : ${ethers.formatEther(attackerInternal)} ETH`);

  if (signerAddress) {
    const signerEth = await ethers.provider.getBalance(signerAddress);
    console.log(`\nSigner          ${signerAddress}`);
    console.log(`  ETH on-chain   : ${ethers.formatEther(signerEth)} ETH`);
  }

  console.log("\n══════════════════════════════════════════\n");

  return { bankEth, attackerEth, bankInternal, attackerInternal, signerDeposit };
}

// ── main ─────────────────────────────────────────────────────────────────────

const { ethers } = await network.create();
const [signer] = await ethers.getSigners();

await checkBalances(ethers, signer.address);
