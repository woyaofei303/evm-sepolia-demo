// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Counter
/// @notice 用最小合约演示前端读取、模拟、写入和事件解析流程。
contract Counter {
    /// @notice 当前 owner；只有该地址可直接设置计数值或转移所有权。
    address public owner;

    /// @notice 当前计数；public 自动生成 number() 读取函数。
    uint256 public number;

    /// @notice 每次递增后记录调用者和新数值，供前端从交易回执中解析。
    event Incremented(address indexed caller, uint256 newValue);

    /// @notice owner 设置数值后记录调用者和新数值。
    event NumberSet(address indexed caller, uint256 newValue);

    /// @notice owner 变更后记录原 owner 和新 owner。
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    constructor() {
        owner = msg.sender;
    }

    /// @notice 将计数加一并发出 Incremented 事件。
    function increment() external {
        number++;
        emit Incremented(msg.sender, number);
    }

    /// @notice 仅当前 owner 可直接设置计数值。
    function setNumber(uint256 newNumber) external {
        require(msg.sender == owner, "Only owner can set number");
        number = newNumber;
        emit NumberSet(msg.sender, newNumber);
    }

    /// @notice 当前 owner 将合约所有权转给非零地址。
    function transferOwnership(address newOwner) external {
        require(msg.sender == owner, "Only owner can transfer ownership");
        require(newOwner != address(0), "New owner cannot be zero address");

        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }
}
