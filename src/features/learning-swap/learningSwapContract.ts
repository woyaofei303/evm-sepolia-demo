import { getAddress, isAddress, parseAbi } from 'viem'

/**
 * ABI 是前端理解合约二进制接口的“说明书”：
 * - function 条目让 Viem 知道如何把函数名和参数编码成 calldata，并解码返回值；
 * - event 条目让页面把回执中的 topics/data 还原成可读字段。
 * 人类可读 ABI 只保留页面实际使用的接口，避免再提交一份容易过期的编译产物 JSON。
 */
export const learningSwapAbi = parseAbi([
  'function owner() view returns (address)',
  'function token() view returns (address)',
  'function initialized() view returns (bool)',
  'function closed() view returns (bool)',
  'function getReserves() view returns (uint256 tokenReserve, uint256 ethReserve)',
  'function quoteTokenForEth(uint256 tokenAmountIn) view returns (uint256 ethAmountOut)',
  'function quoteEthForToken(uint256 ethAmountIn) view returns (uint256 tokenAmountOut)',
  'function initialize(uint256 tokenAmount) payable',
  'function swapTokenForEth(uint256 tokenAmountIn, uint256 minAmountOut, uint256 deadline)',
  'function swapEthForToken(uint256 minAmountOut, uint256 deadline) payable',
  'function close()',
  'event Initialized(address indexed owner, uint256 tokenAmount, uint256 ethAmount)',
  'event Swap(address indexed account, bool tokenToEth, uint256 amountIn, uint256 amountOut)',
  'event Closed(address indexed owner, uint256 tokenAmount, uint256 ethAmount)',
])

/**
 * NEXT_PUBLIC_* 会被打包到浏览器，只适合公开合约地址；私钥和助记词绝不能放在这里。
 * 保留 raw 值是为了让页面区分“没有配置”和“配置了无效地址”；只有校验后的地址会交给 RPC。
 */
export const rawSwapAddress =
  process.env.NEXT_PUBLIC_LEARNING_SWAP_ADDRESS?.trim()

export const swapAddress =
  rawSwapAddress && isAddress(rawSwapAddress)
    ? getAddress(rawSwapAddress)
    : undefined
