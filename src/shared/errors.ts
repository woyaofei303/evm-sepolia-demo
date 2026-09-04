// shared 目录保存多个功能都会使用的代码；钱包、Viem 和 RPC 错误都在这里统一成中文提示。
type WalletError = {
  code?: number | string
  message?: string
  shortMessage?: string
}

/**
 * 把常见的钱包与 RPC 错误归一化成面向用户的中文提示。
 * Solana 调用可覆盖网络名和原生资产名，复用同一套错误映射。
 */
export function getErrorMessage(
  error: unknown,
  chainName = 'Sepolia',
  nativeAsset = 'Sepolia ETH',
): string {
  const value = (error ?? {}) as WalletError
  // 优先使用钱包提供的短消息，再回退到标准 Error.message。
  const message =
    value.shortMessage ||
    value.message ||
    (error instanceof Error ? error.message : '')
  const normalized = message.toLowerCase()

  // EIP-1193 和部分钱包分别用数字码、字符串码或消息表达“用户拒绝”。
  if (
    value.code === 4001 ||
    value.code === 'ACTION_REJECTED' ||
    normalized.includes('user rejected')
  ) {
    return '用户已在钱包中拒绝请求。'
  }
  // 后续分支按稳定关键词映射；未知错误仍保留原始消息，方便排查。
  if (normalized.includes('insufficient funds')) {
    return `${nativeAsset} 不足，无法支付转账金额和手续费。`
  }
  if (normalized.includes('destination matches source')) {
    return `收款地址不能与当前 ${chainName} 账户相同，请填写另一个测试钱包地址。`
  }
  if (normalized.includes('provider not found')) {
    return '未检测到浏览器扩展钱包，请安装或解锁钱包。'
  }
  if (
    normalized.includes('chain mismatch') ||
    normalized.includes('wrong chain')
  ) {
    return `请将钱包切换到 ${chainName} 后重试。`
  }
  if (normalized.includes('reverted')) {
    return '合约模拟或链上交易已回滚。'
  }
  if (normalized.includes('http request failed')) {
    return 'RPC 请求失败，请检查网络或公共 RPC。'
  }
  if (
    normalized.includes('failed when it was simulated') &&
    normalized.includes('resource limit')
  ) {
    return 'Solana 交易模拟失败，请检查 Devnet SOL 余额、收款地址和 RPC 后重试。'
  }
  return message ? `钱包或 RPC 错误：${message}` : '未知的钱包或 RPC 错误。'
}
