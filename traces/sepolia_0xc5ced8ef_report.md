# Reentrancy Attack — Sepolia Deployment Report

## Contracts on Sepolia Etherscan

| Contract       | Address                                                                 |
|----------------|-------------------------------------------------------------------------|
| VulnerableBank | 0x2a64136ae528492beCaa04ea95A5b87E2f0Fa9DE                              |
| Attacker       | 0x8FD169A622A48f7E04E024af0E4343c2cEFC1015                              |

## Transactions

| Event          | TX Hash                                                                                        |
|----------------|------------------------------------------------------------------------------------------------|
| Victim deposit | 0xa4f02cc3de365d58d321d3f556cd143aaced8c0018ff42f35e3310a00a53072c                            |
| Attack TX      | 0xc5ced8ef7ddc27eb362238381fa6bbd6b1f595593d0935806b28cc63b6175ffc                            |

- **Attack block:** 11010195
- **Bank drained:** true
- **Victim deposit:** 0.05 ETH
- **Attack amount:** 0.05 ETH (ATTACK_AMOUNT constant in Attacker.sol)
- **Reentrancy loops:** 2 (bank total 0.10 ETH / 0.05 ETH per withdrawal)

## Etherscan Links

- VulnerableBank: https://sepolia.etherscan.io/address/0x2a64136ae528492beCaa04ea95A5b87E2f0Fa9DE
- Attacker: https://sepolia.etherscan.io/address/0x8FD169A622A48f7E04E024af0E4343c2cEFC1015
- Victim deposit tx: https://sepolia.etherscan.io/tx/0xa4f02cc3de365d58d321d3f556cd143aaced8c0018ff42f35e3310a00a53072c
- Attack tx: https://sepolia.etherscan.io/tx/0xc5ced8ef7ddc27eb362238381fa6bbd6b1f595593d0935806b28cc63b6175ffc

## Trace

- **File:** traces/sepolia_0xc5ced8ef.txt
- **Format:** TXSpector opcode-level trace — `<pc>;<opcode>;<stack_top_decimal>`
- **Total opcode steps:** 799
- **Captured from:** local Hardhat EDR (identical bytecode and attack parameters as Sepolia)

## Reentrancy Pattern in the Trace

The 2-loop reentrancy is clearly visible:

```
line  48:  SLOAD              ← bank reads attacker's balance (0.05 ETH)
line  90:  CALL               ← bank sends ETH to Attacker.receive()  ← REENTRANCY ENTRY
line 237:    SLOAD            ← re-enter: bank reads balance again (still 0.05 — not zeroed yet!)
line 278:    CALL             ← second ETH transfer (reentrancy loop 2)
line 337:      SLOAD
line 421:      CALL           ← third attempt — gas too low or bank empty → stops
line 717:    SSTORE           ← bank FINALLY zeroes balance (too late, ETH already sent twice)
line 781:  SSTORE             ← outer withdraw also zeroes (redundant, already 0)
```

**Root cause:** `SSTORE` (state update) happens **after** `CALL` (ETH transfer).
This violates the Checks-Effects-Interactions pattern:
the attacker re-enters `withdraw()` before the balance mapping is zeroed,
draining the bank multiple times with a single deposited balance.
