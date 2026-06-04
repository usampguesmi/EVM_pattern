import "@nomicfoundation/hardhat-ethers";
import { network } from "hardhat";

const { ethers } = await network.create();

const [deployer] = await ethers.getSigners();
console.log("Deploying contracts with:", deployer.address);

const balance = await ethers.provider.getBalance(deployer.address);
console.log("Deployer balance:", ethers.formatEther(balance), "ETH");

// 1. Deploy VulnerableBank (no constructor args)
const VulnerableBankFactory = await ethers.getContractFactory("VulnerableBank");
const vulnerableBank = await VulnerableBankFactory.deploy();
await vulnerableBank.waitForDeployment();
const bankAddress = await vulnerableBank.getAddress();
console.log("VulnerableBank deployed to:", bankAddress);

// 2. Deploy Attacker (needs VulnerableBank address)
const AttackerFactory = await ethers.getContractFactory("Attacker");
const attacker = await AttackerFactory.deploy(bankAddress);
await attacker.waitForDeployment();
const attackerAddress = await attacker.getAddress();
console.log("Attacker deployed to:", attackerAddress);

console.log("\n--- Sepolia Etherscan ---");
console.log("VulnerableBank:", `https://sepolia.etherscan.io/address/${bankAddress}`);
console.log("Attacker:      ", `https://sepolia.etherscan.io/address/${attackerAddress}`);
