
 // SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract MockStablecoin {
    string public name = "Mock USD Coin";
    string public symbol = "mUSDC";
    uint8 public decimals = 6;

    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;

    event Transfer(
        address indexed from,
        address indexed to,
        uint256 value
    );

    constructor() {
        totalSupply = 1_000_000 * 10**6;
        balanceOf[msg.sender] = totalSupply;

        emit Transfer(address(0), msg.sender, totalSupply);
    }

    function transfer(
        address to,
        uint256 amount
    ) public returns (bool) {
        require(to != address(0), "Invalid recipient");
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");

        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;

        emit Transfer(msg.sender, to, amount);

        return true;
    }
}
