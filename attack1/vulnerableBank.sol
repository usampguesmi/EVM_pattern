pragma solidity ^0.8.20;

contract VulnerableBank {
    mapping(address => uint256) public balances;

    function deposit() public payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw() public {
        uint256 balance = balances[msg.sender];
        require(balance > 0, "Insufficient balance");
        (bool success, ) = msg.sender.call{value: balance}("");
        require(success, "Transfer failed");
        balances[msg.sender] = 0;
    }
    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }
    function getBalanceOf(address _address) public view returns (uint256) {
        return balances[_address];
    }
    
}