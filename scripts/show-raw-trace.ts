import { network } from "hardhat";

const conn = await network.create();
const { ethers } = conn;
const [victim, attackerEOA] = await ethers.getSigners();

const Bank = await ethers.getContractFactory("contracts/examples/reentrancy-bank/VulnerableBank.sol:VulnerableBank");
const bank = (await (await Bank.deploy()).waitForDeployment()) as any;

const Att = await ethers.getContractFactory("contracts/examples/reentrancy-bank/Attacker.sol:Attacker");
const att = (await (await Att.deploy(await bank.getAddress())).waitForDeployment()) as any;

await (await bank.connect(victim).deposit({ value: ethers.parseEther("5") })).wait();
const receipt = await (await att.connect(attackerEOA).attack({ value: ethers.parseEther("1") })).wait();

// ── raw response from Hardhat EDR — zero processing by me ────────────────────
const raw: any = await conn.provider.request({
  method: "debug_traceTransaction",
  params: [receipt!.hash, { disableMemory: true, disableStorage: true }],
});

console.log("══ tx hash (from receipt):", receipt!.hash);
console.log("══ structLogs.length     :", raw.structLogs.length);
console.log("\n══ First 5 raw structLogs as returned by Hardhat EDR (no changes):\n");
console.log(JSON.stringify(raw.structLogs.slice(0, 5), null, 2));
console.log("\n══ StructLog #841 (the first CALL — entry into VulnerableBank):\n");
console.log(JSON.stringify(raw.structLogs[840], null, 2));
