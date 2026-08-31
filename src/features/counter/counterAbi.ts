// Counter 功能把前端 ABI 与页面放在同一目录；Viem 会把人类可读 ABI 转成强类型 ABI。
import { parseAbi } from 'viem'

// 只声明页面实际调用的读取、写入和事件，保持演示接口最小化。
export const counterAbi = parseAbi([
  'function owner() view returns (address)',
  'function number() view returns (uint256)',
  'function increment()',
  'function setNumber(uint256 newNumber)',
  'event Incremented(address indexed caller, uint256 newValue)',
  'event NumberSet(address indexed caller, uint256 newValue)',
])
