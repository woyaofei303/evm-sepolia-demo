import { parseUnits } from 'viem'

// 本文件只保存与链无关的滑点计算；ABI 和合约地址在 learningSwapContract.ts 中。

// 初始值对应 50 个基点，即用户默认接受报价向不利方向变化最多 0.5%。
export const DEFAULT_SLIPPAGE = '0.5'

// 1% = 100 个基点，100% = 10_000 个基点。bigint 保证链上金额计算不会丢精度。
const BASIS_POINTS = 10_000n
// 页面按已确认设计最多允许 5% 滑点，阻止初学者误填过大的成交容忍度。
const MAX_SLIPPAGE_BPS = 500n
const SLIPPAGE_ERROR = '滑点必须在 0% 到 5% 之间。'

/**
 * 把输入框中的百分比字符串转换为链上计算使用的基点。
 * 先检查原始 Number，是为了拒绝 5.001 这类可能被 parseUnits 四舍五入成 5.00 的超界输入；
 * 再用 parseUnits(value, 2) 转为 bigint，避免用浮点数参与最终资产计算。
 */
export function parseSlippageBps(value: string): bigint {
  let basisPoints: bigint
  try {
    const percentage = Number(value)
    if (
      !value.trim() ||
      !Number.isFinite(percentage) ||
      percentage < 0 ||
      percentage > 5
    ) {
      throw new Error(SLIPPAGE_ERROR)
    }
    basisPoints = parseUnits(value, 2)
  } catch {
    throw new Error(SLIPPAGE_ERROR)
  }
  if (basisPoints < 0n || basisPoints > MAX_SLIPPAGE_BPS) {
    throw new Error(SLIPPAGE_ERROR)
  }
  return basisPoints
}

/**
 * 根据报价和滑点得到交易 calldata 中的 minAmountOut。
 * 整数除法会向下取整：宁可把最低到账少算一个最小单位，也不要因前端向上取整让正常交易意外回滚。
 */
export function minimumAmountOut(quote: bigint, slippageBps: bigint): bigint {
  if (quote < 0n) throw new Error('报价不能小于零。')
  if (slippageBps < 0n || slippageBps > MAX_SLIPPAGE_BPS) {
    throw new Error(SLIPPAGE_ERROR)
  }
  return (quote * (BASIS_POINTS - slippageBps)) / BASIS_POINTS
}

/** 钱包至少需要覆盖交易 value 与 gasLimit * maxFeePerGas，两项都用 wei bigint。 */
export function maximumTransactionCost(
  value: bigint,
  gasLimit: bigint,
  maxFeePerGas: bigint,
): bigint {
  if (value < 0n || gasLimit < 0n || maxFeePerGas < 0n) {
    throw new Error('交易预算参数不能小于零。')
  }
  return value + gasLimit * maxFeePerGas
}
