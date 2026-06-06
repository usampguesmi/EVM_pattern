pragma solidity ^0.8.20;

contract ReentrancyPool {
    mapping(address => uint256) public balances;

    function contribute() external payable {
        balances[msg.sender] += msg.value;
    }

    function collect() external {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "No balance to collect");

        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");

        balances[msg.sender] = 0;
    }

    function getPoolBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
