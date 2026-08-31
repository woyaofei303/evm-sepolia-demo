// 该组件被多个 EVM 功能复用，所以放在 shared/evm；它把 Wagmi 的异步状态变成用户可读流程。
import { sepolia } from 'wagmi/chains'
import type { Hash } from 'viem'

// 只依赖页面实际展示的回执字段，因此原生转账和合约写入都能复用。
type ReceiptSummary = {
  blockNumber: bigint
  gasUsed: bigint
  status: 'success' | 'reverted'
  transactionHash: Hash
}

export function TransactionLifecycle({
  hash,
  prompting,
  confirming,
  receipt,
  error,
}: {
  hash?: Hash
  prompting: boolean
  confirming: boolean
  receipt?: ReceiptSummary
  error?: string
}) {
  // 优先级从失败和链上回执开始，避免旧 Hash 掩盖最终结果。
  const stage = error
    ? '失败'
    : receipt
      ? '已确认'
      : confirming
        ? '确认中'
        : hash
          ? '已提交'
          : prompting
            ? '等待钱包确认'
            : '待操作'

  return (
    // aria-live 会让辅助技术在交易状态变化时自动播报更新。
    <div className="lifecycle" aria-live="polite">
      <p>
        <span className="status-dot" /> <strong>{stage}</strong>
      </p>
      {/* Hash 指向固定的 Sepolia 浏览器，方便独立核对链上交易。 */}
      {hash && (
        <p className="mono">
          交易哈希：{' '}
          <a
            href={`${sepolia.blockExplorers.default.url}/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
          >
            {hash}
          </a>
        </p>
      )}
      {/* 回执确认后展示区块、Gas 和执行状态三个最重要字段。 */}
      {receipt && (
        <p className="mono">
          区块 {receipt.blockNumber.toString()} · Gas 使用量{' '}
          {receipt.gasUsed.toString()} ·{' '}
          {receipt.status === 'success' ? '成功' : '已回滚'}
        </p>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
