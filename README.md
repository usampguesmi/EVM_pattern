# EVM Reentrancy Attack — Opcode-Level Trace Pipeline

A research toolkit for **opcode-level EVM transaction tracing** of reentrancy attacks, built on Hardhat v3 EDR.  
It replaces a patched Geth node (the classical approach for capturing execution traces) with a fully local, deterministic Hardhat simulation that produces traces in **TXSpector format** — the same format used by the TXSpector vulnerability detection framework.

---

## What This Project Does

1. **Deploys** vulnerable smart contracts and attacker contracts to **Sepolia testnet** — every contract and transaction is publicly visible on Etherscan.
2. **Replays** the exact same attack locally using **Hardhat EDR** (`debug_traceTransaction`) — because Alchemy's free tier blocks the debug namespace, traces are captured locally while on-chain visibility is kept.
3. **Exports** the full opcode-level execution trace in **TXSpector format**: `<pc>;<opcode>;<stack_top_decimal>` — one line per EVM instruction.

This two-phase design means you get both:
- **On-chain proof** (Etherscan links, real transaction hashes, verifiable contracts)
- **Accurate execution traces** (local EDR, no rate limits, free debug API)

---

## Why Hardhat EDR Instead of Patched Geth?

The classical approach for opcode tracing requires patching Geth's source code to emit structLogs to an external store (e.g. MongoDB) during block execution — a process that requires a fully synced Sepolia node (weeks of sync time, significant disk space).

Hardhat v3 EDR exposes `debug_traceTransaction` natively on its simulated chain.  
EVM opcodes are determined solely by **bytecode + calldata + initial storage state** — not by which network produced the block. The reentrancy opcode sequence is identical on Sepolia and on a local EDR instance given the same contracts and call parameters.

---

## Reentrancy Attack Examples

Three independent attack scenarios are included, each with its own vulnerable contract, attacker contract, deployment script, and trace output.

### 1. `reentrancy-bank` — VulnerableBank + Attacker

| File | Description |
|---|---|
| [contracts/examples/reentrancy-bank/VulnerableBank.sol](contracts/examples/reentrancy-bank/VulnerableBank.sol) | Vulnerable `deposit` / `withdraw` pattern |
| [contracts/examples/reentrancy-bank/Attacker.sol](contracts/examples/reentrancy-bank/Attacker.sol) | Attacker — `ATTACK_AMOUNT = 0.05 ETH` |
| [scripts/examples/reentrancy-bank-sepolia-trace.ts](scripts/examples/reentrancy-bank-sepolia-trace.ts) | Two-phase script: Sepolia deploy + local trace |

**Attack amount:** 0.05 ETH · **Victim deposit:** 0.05 ETH · **Minimum wallet balance needed:** 0.11 ETH

**Sepolia deployment (completed):**
- VulnerableBank: [`0x2a64136ae528492beCaa04ea95A5b87E2f0Fa9DE`](https://sepolia.etherscan.io/address/0x2a64136ae528492beCaa04ea95A5b87E2f0Fa9DE)
- Attacker: [`0x8FD169A622A48f7E04E024af0E4343c2cEFC1015`](https://sepolia.etherscan.io/address/0x8FD169A622A48f7E04E024af0E4343c2cEFC1015)
- Attack TX: [`0xc5ced8ef7ddc27eb362238381fa6bbd6b1f595593d0935806b28cc63b6175ffc`](https://sepolia.etherscan.io/tx/0xc5ced8ef7ddc27eb362238381fa6bbd6b1f595593d0935806b28cc63b6175ffc)
- Block: `11010195` · Bank drained: `true`

**Trace:** [traces/sepolia_0xc5ced8ef.txt](traces/sepolia_0xc5ced8ef.txt) — 799 opcode steps  
**Report:** [traces/sepolia_0xc5ced8ef_report.md](traces/sepolia_0xc5ced8ef_report.md)

---

### 2. `reentrancy-pool` — ReentrancyPool + PoolAttacker

| File | Description |
|---|---|
| [contracts/examples/reentrancy-pool/ReentrancyPool.sol](contracts/examples/reentrancy-pool/ReentrancyPool.sol) | `contribute` / `collect` pattern — balance not zeroed before external call |
| [contracts/examples/reentrancy-pool/PoolAttacker.sol](contracts/examples/reentrancy-pool/PoolAttacker.sol) | Attacker — `ATTACK_AMOUNT = 0.05 ETH` |
| [scripts/examples/reentrancy-pool-sepolia-trace.ts](scripts/examples/reentrancy-pool-sepolia-trace.ts) | Two-phase script: Sepolia deploy + local trace |

**Attack amount:** 0.05 ETH · **Victim deposit:** 0.05 ETH · **Minimum wallet balance needed:** 0.11 ETH

Trace file will be saved as `traces/sepolia_pool_<txhash>.txt` after the script runs.

---

### 3. `reentrancy-vault` — SimpleVault + VaultAttacker

| File | Description |
|---|---|
| [contracts/examples/reentrancy-vault/SimpleVault.sol](contracts/examples/reentrancy-vault/SimpleVault.sol) | `deposit` / `withdraw` pattern |
| [contracts/examples/reentrancy-vault/VaultAttacker.sol](contracts/examples/reentrancy-vault/VaultAttacker.sol) | Attacker — `ATTACK_AMOUNT = 0.1 ETH` |
| [scripts/examples/reentrancy-vault-sepolia-trace.ts](scripts/examples/reentrancy-vault-sepolia-trace.ts) | Two-phase script: Sepolia deploy + local trace |

**Attack amount:** 0.1 ETH · **Victim deposit:** 0.1 ETH · **Minimum wallet balance needed:** 0.22 ETH

Trace file will be saved as `traces/sepolia_vault_<txhash>.txt` after the script runs.

---

## Trace Format — TXSpector

Every trace file follows the TXSpector opcode-level format:

```
<pc>;<opcode>;<stack_top_decimal>
```

- `pc` — program counter (byte offset in the contract bytecode)
- `opcode` — mnemonic of the EVM instruction (`PUSH1`, `SLOAD`, `CALL`, `SSTORE`, …)
- `stack_top_decimal` — **post-execution** top-of-stack value as a decimal integer (empty when the stack is empty after the instruction)

Example excerpt from the bank attack trace (the reentrancy entry point):

```
90;CALL;1          ← bank sends ETH → triggers Attacker.receive()
237;SLOAD;...      ← re-enter: bank reads balance again (still non-zero!)
278;CALL;1         ← second ETH transfer before balance is zeroed
717;SSTORE;0       ← bank finally zeroes balance — too late
```

A reference trace from the original TXSpector paper is included at [txspectorTrace1.txt](txspectorTrace1.txt) for format comparison.

---

## Where to Find Traces and Transaction Details

| What | Where |
|---|---|
| Bank attack trace (799 steps) | [traces/sepolia_0xc5ced8ef.txt](traces/sepolia_0xc5ced8ef.txt) |
| Bank attack report (addresses, links, analysis) | [traces/sepolia_0xc5ced8ef_report.md](traces/sepolia_0xc5ced8ef_report.md) |
| Local bank trace — 101 reentrancy loops (28 717 steps) | [traces/trace_0x402f1164.txt](traces/trace_0x402f1164.txt) |
| Pool attack trace | `traces/sepolia_pool_<txhash>.txt` (after script runs) |
| Vault attack trace | `traces/sepolia_vault_<txhash>.txt` (after script runs) |
| TXSpector reference trace | [txspectorTrace1.txt](txspectorTrace1.txt) |
| All Sepolia contracts + TXs | Etherscan links in each `_report.md` file |

---

## Project Structure

```
.
├── contracts/
│   └── examples/
│       ├── reentrancy-bank/
│       │   ├── VulnerableBank.sol
│       │   └── Attacker.sol
│       ├── reentrancy-pool/
│       │   ├── ReentrancyPool.sol
│       │   └── PoolAttacker.sol
│       └── reentrancy-vault/
│           ├── SimpleVault.sol
│           └── VaultAttacker.sol
├── scripts/
│   ├── trace-attack.ts                         ← local bank trace only
│   ├── show-raw-trace.ts                       ← raw EDR output (authenticity check)
│   └── examples/
│       ├── reentrancy-bank-sepolia-trace.ts    ← bank: Sepolia + trace
│       ├── reentrancy-pool-sepolia-trace.ts    ← pool: Sepolia + trace
│       └── reentrancy-vault-sepolia-trace.ts   ← vault: Sepolia + trace
├── traces/
│   ├── sepolia_0xc5ced8ef.txt                 ← bank trace (799 steps)
│   ├── sepolia_0xc5ced8ef_report.md           ← bank report
│   └── trace_0x402f1164.txt                   ← local bank trace (28 717 steps)
├── txspectorTrace1.txt                         ← TXSpector reference trace
└── hardhat.config.ts
```

---

## Setup and Usage

### Prerequisites

- Node.js ≥ 18
- An Alchemy (or equivalent) Sepolia RPC URL
- A Sepolia wallet with enough test ETH

### Install

```bash
npm install
```

### Configure

Create a `.env` file:

```env
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
PRIVATE_KEY=0xYOUR_PRIVATE_KEY
```

Or use Hardhat's keystore:

```bash
npx hardhat keystore set SEPOLIA_RPC_URL
npx hardhat keystore set PRIVATE_KEY
```

### Run local trace only (no Sepolia wallet needed)

```bash
npx hardhat run scripts/trace-attack.ts
```

Outputs a trace file in `./traces/` and prints a summary.

### Run full two-phase attack (Sepolia + local trace)

```bash
# Bank  — needs ≥ 0.11 Sepolia ETH
npx hardhat run scripts/examples/reentrancy-bank-sepolia-trace.ts

# Pool  — needs ≥ 0.11 Sepolia ETH
npx hardhat run scripts/examples/reentrancy-pool-sepolia-trace.ts

# Vault — needs ≥ 0.22 Sepolia ETH
npx hardhat run scripts/examples/reentrancy-vault-sepolia-trace.ts
```

Each script:
1. Deploys the vulnerable contract and attacker on Sepolia — logs Etherscan links.
2. Runs the victim deposit and the attack transaction on-chain.
3. Replays the attack locally on Hardhat EDR.
4. Saves `traces/sepolia_<variant>_<txhash>.txt` and a `_report.md` alongside it.

### Verify trace authenticity

```bash
npx hardhat run scripts/show-raw-trace.ts
```

Prints the raw unprocessed JSON from Hardhat EDR (`debug_traceTransaction` response) to show that traces are genuine EVM output, not synthesised data.

---

## How the Stack Timing Works

Hardhat EDR (like Geth) records stack state **before** each instruction (pre-execution snapshot).  
TXSpector expects **post-execution** stack top.

Fix: for instruction `i`, the post-execution stack top equals the pre-execution stack top of instruction `i+1`, provided both instructions are at the same call depth. This is implemented in `formatTxSpectorTrace()` inside each script.

---

## License

MIT — see [LICENSE](LICENSE).

---

## References

- [TXSpector: Dissecting Ethereum Transactions for Smart Contract Vulnerability Detection](https://www.usenix.org/conference/usenixsecurity21/presentation/zhang-mengya) — USENIX Security 2021
- [Hardhat v3 Beta](https://hardhat.org/docs/getting-started)
- [Checks-Effects-Interactions Pattern](https://docs.soliditylang.org/en/latest/security-considerations.html#use-the-checks-effects-interactions-pattern)
