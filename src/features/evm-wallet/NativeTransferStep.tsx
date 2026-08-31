'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import {
  useConnection,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { getAddress, isAddress, parseEther, type Hash } from 'viem'

import { getErrorMessage } from '../../shared/errors'
import { TransactionLifecycle } from '../../shared/evm/TransactionLifecycle'

// 第 03 步只负责原生 ETH 转账，交易 Hash 会驱动后续的链上确认状态。
export function NativeTransferStep() {
  // useQueryClient 取得 Wagmi 共用的 TanStack Query 缓存，交易确认后用它刷新链上数据。
  const queryClient = useQueryClient()

  // useConnection 提供当前账户和 chainId，用来判断是否允许发起 Sepolia 交易。
  const connection = useConnection()

  // useSendTransaction 把原生 ETH 转账请求交给钱包，并暴露等待钱包确认等异步状态。
  const sendTransaction = useSendTransaction()

  // recipient 和 amount 是两个受控输入；默认使用很小的测试网金额。
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('0.00001')

  // 钱包广播交易后返回 Hash；它既用于页面展示，也是查询链上回执的键。
  const [hash, setHash] = useState<Hash>()

  // 同一状态承接本地校验、用户拒绝、钱包和发交易错误，交给生命周期组件展示。
  const [transferError, setTransferError] = useState('')

  // Hash 存在后，useWaitForTransactionReceipt 才会轮询 Sepolia，直到交易确认或失败。
  const receipt = useWaitForTransactionReceipt({
    chainId: sepolia.id,
    hash,
  })

  // 连接钱包且当前网络为 Sepolia 时，才开放转账按钮。
  const canTransact =
    connection.isConnected && connection.chainId === sepolia.id

  // 回执成功表示交易已上链，此时刷新查询，步骤 01 的余额也会同步更新。
  useEffect(() => {
    if (!receipt.isSuccess) return
    // ponytail: 当前只有一个 Wagmi 查询域；加入无关查询后再按 query key 精确刷新。
    void queryClient.invalidateQueries()
  }, [queryClient, receipt.isSuccess])

  // 先校验地址和金额，再把标准化后的交易请求交给钱包确认。
  async function handleTransfer(event: FormEvent) {
    // 阻止表单刷新页面，并清掉上一次交易的错误和 Hash。
    event.preventDefault()
    setTransferError('')
    setHash(undefined)
    try {
      if (!isAddress(recipient)) {
        throw new Error('请输入有效的 0x 收款地址。')
      }
      // parseEther 把用户输入的 ETH 小数转成交易需要的 Wei bigint。
      const value = parseEther(amount)
      if (value <= 0n) throw new Error('金额必须大于零。')
      // getAddress 输出校验和标准化后的地址；mutateAsync 在钱包广播后返回交易 Hash。
      setHash(
        await sendTransaction.mutateAsync({
          chainId: sepolia.id,
          to: getAddress(recipient),
          value,
        }),
      )
    } catch (error) {
      setTransferError(getErrorMessage(error))
    }
  }

  return (
    <section>
      {/* 输入 → 钱包确认 → 获得 Hash → 等待回执，是一笔链上交易的完整路径。 */}
      <span className="step">03</span>
      <h2>发送 Sepolia 测试 ETH</h2>
      <p className="muted">
        这是一笔真实的 Sepolia
        测试网交易。请从极小金额开始，并在钱包中核对收款地址。
      </p>
      <form onSubmit={handleTransfer}>
        <label>
          收款地址
          <input
            autoComplete="off"
            onChange={(event) => setRecipient(event.target.value)}
            placeholder="0x…"
            required
            spellCheck={false}
            value={recipient}
          />
        </label>
        <label>
          金额（Sepolia ETH）
          <input
            min="0.000001"
            onChange={(event) => setAmount(event.target.value)}
            required
            step="0.000001"
            type="number"
            value={amount}
          />
        </label>
        {/* 错误网络、等待钱包或等待链上回执时禁止重复提交。 */}
        <button
          disabled={
            !canTransact ||
            sendTransaction.isPending ||
            (receipt.isPending && Boolean(hash))
          }
          type="submit"
        >
          {sendTransaction.isPending ? '请检查钱包…' : '发送测试 ETH'}
        </button>
      </form>
      {/* 生命周期组件统一展示“钱包确认、链上确认、成功或失败”。 */}
      <TransactionLifecycle
        confirming={receipt.isPending && Boolean(hash)}
        error={
          transferError ||
          (receipt.error ? getErrorMessage(receipt.error) : undefined)
        }
        hash={hash}
        prompting={sendTransaction.isPending}
        receipt={receipt.data}
      />
    </section>
  )
}
