'use client'

import {
  DAppKitProvider,
  useCurrentAccount,
  useCurrentClient,
  useCurrentNetwork,
  useCurrentWallet,
  useDAppKit,
} from '@mysten/dapp-kit-react'
import { ConnectButton } from '@mysten/dapp-kit-react/ui'
import { coinWithBalance, Transaction } from '@mysten/sui/transactions'
import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { formatUnits, parseUnits } from 'viem'

import { getErrorMessage } from '../../shared/errors'
import { readCounterValue, suiDAppKit } from './suiClient'

const packageId = process.env.NEXT_PUBLIC_SUI_COUNTER_PACKAGE_ID?.trim()
const counterId = process.env.NEXT_PUBLIC_SUI_COUNTER_OBJECT_ID?.trim()
const counterConfigured = Boolean(
  packageId &&
  counterId &&
  isValidSuiAddress(packageId) &&
  isValidSuiAddress(counterId),
)

function transactionError(result: {
  FailedTransaction?: { status: { error: unknown } }
}) {
  const error = result.FailedTransaction?.status.error
  return typeof error === 'string' ? error : JSON.stringify(error)
}

function SuiWalletDemo() {
  const dAppKit = useDAppKit(suiDAppKit)
  const client = useCurrentClient({ dAppKit: suiDAppKit })
  const account = useCurrentAccount({ dAppKit: suiDAppKit })
  const wallet = useCurrentWallet({ dAppKit: suiDAppKit })
  const network = useCurrentNetwork({ dAppKit: suiDAppKit })
  const [balance, setBalance] = useState<string>()
  const [balanceError, setBalanceError] = useState('')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('0.01')
  const [transferStatus, setTransferStatus] = useState('待操作')
  const [transferError, setTransferError] = useState('')
  const [transferDigest, setTransferDigest] = useState('')
  const [sending, setSending] = useState(false)
  const [counterValue, setCounterValue] = useState<string>()
  const [counterStatus, setCounterStatus] = useState('待读取共享对象')
  const [counterError, setCounterError] = useState('')
  const [counterDigest, setCounterDigest] = useState('')
  const [incrementing, setIncrementing] = useState(false)

  const refreshBalance = useCallback(async () => {
    if (!account) {
      setBalance(undefined)
      return
    }
    setBalanceError('')
    try {
      const result = await client.getBalance({ owner: account.address })
      setBalance(formatUnits(BigInt(result.balance.balance), 9))
    } catch (error) {
      setBalanceError(getErrorMessage(error, 'Sui Devnet', 'Devnet SUI'))
    }
  }, [account, client])

  const refreshCounter = useCallback(async () => {
    if (!counterConfigured || !counterId) return
    setCounterError('')
    setCounterStatus('正在读取共享对象…')
    try {
      const result = await client.getObject({
        objectId: counterId,
        include: { json: true },
      })
      const value = readCounterValue(result.object.json)
      if (value === undefined) throw new Error('Counter 对象缺少 value 字段。')
      setCounterValue(value)
      setCounterStatus('共享 Counter 已就绪')
    } catch (error) {
      setCounterStatus('读取失败')
      setCounterError(getErrorMessage(error, 'Sui Devnet', 'Devnet SUI'))
    }
  }, [client])

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshBalance())
    return () => window.clearTimeout(timer)
  }, [refreshBalance])

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshCounter())
    return () => window.clearTimeout(timer)
  }, [refreshCounter])

  async function sendSui(event: FormEvent) {
    event.preventDefault()
    setSending(true)
    setTransferDigest('')
    setTransferError('')
    setTransferStatus('正在校验')
    try {
      if (!account) throw new Error('请先连接 Sui 钱包。')
      if (!isValidSuiAddress(recipient)) throw new Error('Sui 收款地址无效。')
      const destination = normalizeSuiAddress(recipient)
      if (destination === normalizeSuiAddress(account.address)) {
        throw new Error('destination matches source')
      }
      const value = parseUnits(amount, 9)
      if (value <= 0n) throw new Error('金额必须大于零。')
      if (balance && value >= parseUnits(balance, 9)) {
        throw new Error('insufficient funds')
      }

      const transaction = new Transaction()
      transaction.transferObjects(
        [coinWithBalance({ balance: value })],
        destination,
      )
      setTransferStatus('请在钱包核对 Devnet 交易…')
      const result = await dAppKit.signAndExecuteTransaction({ transaction })
      if (result.$kind === 'FailedTransaction') {
        throw new Error(transactionError(result))
      }
      const digest = result.Transaction.digest
      setTransferDigest(digest)
      setTransferStatus('已提交，等待 Sui Devnet 最终确认…')
      await client.waitForTransaction({ digest })
      setTransferStatus('已确认')
      await refreshBalance()
    } catch (error) {
      setTransferStatus('失败')
      setTransferError(getErrorMessage(error, 'Sui Devnet', 'Devnet SUI'))
    } finally {
      setSending(false)
    }
  }

  async function incrementCounter() {
    setIncrementing(true)
    setCounterDigest('')
    setCounterError('')
    setCounterStatus('正在构造共享对象交易…')
    try {
      if (!account) throw new Error('请先连接 Sui 钱包。')
      if (!counterConfigured || !packageId || !counterId) {
        throw new Error('请先配置 Sui Counter 的 Package ID 和 Object ID。')
      }
      const transaction = new Transaction()
      transaction.moveCall({
        arguments: [transaction.object(counterId)],
        target: `${packageId}::counter::increment`,
      })
      setCounterStatus('请在钱包核对共享 Counter 调用…')
      const result = await dAppKit.signAndExecuteTransaction({ transaction })
      if (result.$kind === 'FailedTransaction') {
        throw new Error(transactionError(result))
      }
      const digest = result.Transaction.digest
      setCounterDigest(digest)
      setCounterStatus('已提交，等待 Sui Devnet 最终确认…')
      await client.waitForTransaction({ digest })
      await refreshCounter()
    } catch (error) {
      setCounterStatus('递增失败')
      setCounterError(getErrorMessage(error, 'Sui Devnet', 'Devnet SUI'))
    } finally {
      setIncrementing(false)
    }
  }

  return (
    <>
      <section>
        <div className="section-heading">
          <div>
            <span className="step">SUI-01</span>
            <h2>Sui Devnet 钱包、余额与转账</h2>
          </div>
          <ConnectButton />
        </div>
        <p className="muted">
          dApp Kit 仅连接 Wallet Standard 钱包；网络固定为 Sui
          Devnet，页面不会接触助记词或私钥。
        </p>

        {account ? (
          <>
            <dl className="facts">
              <div>
                <dt>钱包</dt>
                <dd>{wallet?.name ?? '已连接钱包'}</dd>
              </div>
              <div>
                <dt>网络</dt>
                <dd>{network === 'devnet' ? 'Sui Devnet' : network}</dd>
              </div>
              <div>
                <dt>账户</dt>
                <dd className="mono">{account.address}</dd>
              </div>
              <div>
                <dt>余额</dt>
                <dd>{balance ? `${balance} SUI` : '读取中…'}</dd>
              </div>
            </dl>
            {balanceError && <p className="error">{balanceError}</p>}

            <form onSubmit={sendSui}>
              <label>
                Sui Devnet 收款地址
                <input
                  autoComplete="off"
                  onChange={(event) => setRecipient(event.target.value)}
                  placeholder="0x…"
                  required
                  value={recipient}
                />
              </label>
              <label>
                转账数量（SUI）
                <input
                  inputMode="decimal"
                  min="0.000000001"
                  onChange={(event) => setAmount(event.target.value)}
                  required
                  step="0.000000001"
                  type="number"
                  value={amount}
                />
              </label>
              <button disabled={sending} type="submit">
                {sending ? '处理中…' : '发送 Devnet SUI'}
              </button>
            </form>
            <div className="lifecycle" aria-live="polite">
              <p>
                <span className="status-dot" />
                状态：{transferStatus}
              </p>
              {transferDigest && (
                <p className="mono">
                  Digest：{' '}
                  <a
                    href={`https://suiscan.xyz/devnet/tx/${transferDigest}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {transferDigest}
                  </a>
                </p>
              )}
              {transferError && <p className="error">{transferError}</p>}
            </div>
          </>
        ) : (
          <p className="muted">
            点击连接按钮，选择支持 Sui Devnet 的浏览器钱包。
          </p>
        )}
      </section>

      <section>
        <div className="section-heading">
          <div>
            <span className="step">SUI-02</span>
            <h2>共享 Move Counter</h2>
          </div>
          <button
            className="secondary"
            disabled={!counterConfigured}
            onClick={() => void refreshCounter()}
            type="button"
          >
            刷新对象
          </button>
        </div>
        <p className="muted">
          Package ID 指向不可变代码，Counter Object ID
          指向共享状态；任意测试钱包都可调用 increment。
        </p>
        {!counterConfigured && (
          <p className="error">
            请配置 <code>NEXT_PUBLIC_SUI_COUNTER_PACKAGE_ID</code> 和{' '}
            <code>NEXT_PUBLIC_SUI_COUNTER_OBJECT_ID</code>。
          </p>
        )}
        <dl className="facts">
          <div>
            <dt>Package ID</dt>
            <dd className="mono">{packageId || '未配置'}</dd>
          </div>
          <div>
            <dt>Counter Object ID</dt>
            <dd className="mono">{counterId || '未配置'}</dd>
          </div>
          <div>
            <dt>当前值</dt>
            <dd>{counterValue ?? '—'}</dd>
          </div>
          <div>
            <dt>状态</dt>
            <dd>{counterStatus}</dd>
          </div>
        </dl>
        <button
          disabled={!account || !counterConfigured || incrementing}
          onClick={() => void incrementCounter()}
          type="button"
        >
          {incrementing ? '处理中…' : 'Counter +1'}
        </button>
        {counterDigest && (
          <p className="result mono">
            Digest：{' '}
            <a
              href={`https://suiscan.xyz/devnet/tx/${counterDigest}`}
              rel="noreferrer"
              target="_blank"
            >
              {counterDigest}
            </a>
          </p>
        )}
        {counterError && <p className="error">{counterError}</p>}
      </section>
    </>
  )
}

export default function SuiPanel() {
  return (
    <DAppKitProvider dAppKit={suiDAppKit}>
      <SuiWalletDemo />
    </DAppKitProvider>
  )
}
