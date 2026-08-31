// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// 直接继承 OpenZeppelin 标准 ERC-20，自动获得 balanceOf、transfer、approve、allowance 和 transferFrom。
import {ERC20} from "@openzeppelin/contracts@5.6.1/token/ERC20/ERC20.sol";

/// @title Sepolia Learning Token
/// @notice 只用于本项目测试网练习的固定初始供应代币，不代表真实资产。
contract LearningToken is ERC20 {
    /**
     * ERC20 构造函数设置名称和符号；_mint 把初始供应记到部署者余额。
     * decimals() 默认是 18，所以 1_000 * 10**18 个最小单位会在钱包中显示为 1,000 SLT。
     */
    constructor() ERC20("Sepolia Learning Token", "SLT") {
        _mint(msg.sender, 1_000 * 10 ** decimals());
    }
}
