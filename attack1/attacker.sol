pragma solidity ^0.8.20;

import {VulnerableBank} from "./vulnerableBank.sol";

contract Attacker {
    VulnerableBank public vulnerableBank;

    constructor(address _vulnerableBank) {
        vulnerableBank = VulnerableBank(_vulnerableBank);
    }
    function attack() public {
        vulnerableBank.deposit{value: 1 ether}();
    }
    function withdraw() public {
        vulnerableBank.withdraw();
    }
    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }
    function getBalanceOf(address _address) public view returns (uint256) {
        return vulnerableBank.getBalanceOf(_address);
    }
}