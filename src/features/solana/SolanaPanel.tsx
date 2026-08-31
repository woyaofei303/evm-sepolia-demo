'use client'

// Solana 面板使用 Wallet Standard 发现钱包，并通过 Kit 客户端读取余额和发送 Devnet SOL。
import { getTransferSolInstruction } from '@solana-program/system'
import {
  fetchMaybeToken,
  fetchMint,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token'
import { address, lamports, type Address } from '@solana/kit'
import {
  useConnect,
  useConnectedWallet,
  useDisconnect,
  useWallets,
  useWalletStatus,
} from '@solana/kit-plugin-wallet/react'
import { ClientProvider, useClient, useRequest } from '@solana/react'
import { useMemo, useState, type FormEvent } from 'react'
import { formatUnits, parseUnits } from 'viem'

import { getErrorMessage } from '../../shared/errors'
import {
  isSolanaDevnetWalletSupported,
  solanaClient,
  type SolanaClient,
  validateSplTransfer,
  validateSolTransfer,
} from './solanaClient'

type SplAccount = {
  ata: Address
  balance: bigint
  decimals: number
  mint: Address
}

// 余额读取拆成子组件，使 key 变化时可以重新挂载并刷新已确认交易后的余额。
function SolBalance({ owner }: { owner: string }) {
  const client = useClient<SolanaClient>()
  // useMemo 保持同一 owner 的请求源稳定，避免每次渲染重复创建 RPC 请求。
  const source = useMemo(
    () => client.rpc.getBalance(address(owner)),
    [client, owner],
  )
  const balance = useRequest(source)

  return (
    <div>
      <dt>Devnet 余额</dt>
      <dd>
        {balance.status === 'fetching'
          ? '读取中…'
          : balance.status === 'error'
            ? getErrorMessage(balance.error, 'Solana Devnet', 'Devnet SOL')
            : `${formatUnits(balance.data?.value ?? 0n, 9)} SOL`}
      </dd>
    </div>
  )
}

function SolanaWallet() {
  // 所有钱包 hooks 从 ClientProvider 取得同一个 Devnet 客户端实例。
  const client = useClient<SolanaClient>()
  const wallets = useWallets(client)
  const status = useWalletStatus(client)
  const connected = useConnectedWallet(client)
  const connect = useConnect(client)
  const disconnect = useDisconnect(client)
  const [destination, setDestination] = useState('')
  const [amount, setAmount] = useState('0.001')
  const [transactionStatus, setTransactionStatus] = useState('待操作')
  const [signature, setSignature] = useState('')
  const [transactionError, setTransactionError] = useState('')
  const [balanceVersion, setBalanceVersion] = useState(0)
  const [sending, setSending] = useState(false)
  const [tokenMint, setTokenMint] = useState(
    process.env.NEXT_PUBLIC_SOLANA_TOKEN_MINT?.trim() ?? '',
  )
  const [tokenDestination, setTokenDestination] = useState('')
  const [tokenAmount, setTokenAmount] = useState('1')
  const [splAccount, setSplAccount] = useState<SplAccount | null>(null)
  const [splStatus, setSplStatus] = useState('待读取 Token')
  const [splSignature, setSplSignature] = useState('')
  const [splError, setSplError] = useState('')
  const [splLoading, setSplLoading] = useState(false)
  const supportsDevnet = Boolean(
    connected &&
    isSolanaDevnetWalletSupported(
      connected.wallet.name,
      connected.account.chains,
    ),
  )

  // 校验输入、构造系统转账指令，再交给连接的钱包签名并等待客户端确认。
  async function sendSol(event: FormEvent) {
    event.preventDefault()
    setSignature('')
    setTransactionError('')
    setTransactionStatus('正在校验')
    setSending(true)
    try {
      if (!connected?.signer)
        throw new Error('请先连接支持签名的 Solana 钱包。')
      if (!supportsDevnet) {
        throw new Error('wallet does not support Solana Devnet')
      }
      const value = parseUnits(amount, 9)
      if (value <= 0n) throw new Error('金额必须大于零。')
      // SOL 固定使用 9 位精度；address() 同时验证目标地址格式。
      const sourceAddress = address(connected.account.address)
      const destinationAddress = address(destination)
      const balance = await client.rpc.getBalance(sourceAddress).send()
      validateSolTransfer(
        balance.value,
        value,
        sourceAddress,
        destinationAddress,
      )
      const transfer = getTransferSolInstruction({
        amount: lamports(value),
        destination: destinationAddress,
        source: connected.signer,
      })
      setTransactionStatus('请检查钱包，然后等待 Devnet 确认…')
      const result = await client.sendTransaction([transfer])
      setSignature(result.context.signature)
      setTransactionStatus('已确认')
      // 递增 key 重新挂载余额组件，确保确认后发起一次新的余额读取。
      setBalanceVersion((current) => current + 1)
    } catch (error) {
      setTransactionStatus('失败')
      setTransactionError(getErrorMessage(error, 'Solana Devnet', 'Devnet SOL'))
    } finally {
      setSending(false)
    }
  }

  async function readSplAccount() {
    if (!connected) throw new Error('请先连接 Solana 钱包。')
    const owner = address(connected.account.address)
    const mint = address(tokenMint.trim())
    const [ata] = await findAssociatedTokenPda({
      mint,
      owner,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
    const [mintAccount, tokenAccount] = await Promise.all([
      fetchMint(client.rpc, mint),
      fetchMaybeToken(client.rpc, ata),
    ])
    if (mintAccount.programAddress !== TOKEN_PROGRAM_ADDRESS) {
      throw new Error('当前仅支持经典 SPL Token Program Mint。')
    }
    return {
      ata,
      balance: tokenAccount.exists ? tokenAccount.data.amount : 0n,
      decimals: mintAccount.data.decimals,
      mint,
    } satisfies SplAccount
  }

  async function refreshSplAccount() {
    setSplError('')
    setSplStatus('正在读取 Mint 与 ATA…')
    setSplLoading(true)
    try {
      const next = await readSplAccount()
      setSplAccount(next)
      setSplStatus(next.balance > 0n ? 'Token 已就绪' : 'ATA 不存在或余额为 0')
    } catch (error) {
      setSplAccount(null)
      setSplStatus('读取失败')
      setSplError(getErrorMessage(error, 'Solana Devnet', 'SPL Token'))
    } finally {
      setSplLoading(false)
    }
  }

  async function sendSpl(event: FormEvent) {
    event.preventDefault()
    setSplSignature('')
    setSplError('')
    setSplStatus('正在校验 Token 与 ATA')
    setSplLoading(true)
    try {
      if (!connected?.signer) throw new Error('请先连接支持签名的钱包。')
      if (!supportsDevnet)
        throw new Error('wallet does not support Solana Devnet')
      const source = await readSplAccount()
      const recipient = address(tokenDestination)
      const value = parseUnits(tokenAmount, source.decimals)
      validateSplTransfer(
        source.balance,
        value,
        connected.account.address,
        recipient,
      )
      const [destinationAta] = await findAssociatedTokenPda({
        mint: source.mint,
        owner: recipient,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      })
      const createAta = getCreateAssociatedTokenIdempotentInstruction({
        ata: destinationAta,
        mint: source.mint,
        owner: recipient,
        payer: connected.signer,
      })
      const transfer = getTransferCheckedInstruction({
        amount: value,
        authority: connected.signer,
        decimals: source.decimals,
        destination: destinationAta,
        mint: source.mint,
        source: source.ata,
      })
      setSplStatus('正在模拟计算量；通过后请在钱包签名…')
      const result = await client.sendTransaction([createAta, transfer])
      setSplSignature(result.context.signature)
      setSplStatus('SPL Token 已确认')
      setSplAccount(await readSplAccount())
    } catch (error) {
      setSplStatus('SPL Token 转账失败')
      setSplError(getErrorMessage(error, 'Solana Devnet', 'SPL Token'))
    } finally {
      setSplLoading(false)
    }
  }

  return (
    <section>
      {/* 07：连接状态、账户信息、转账表单和生命周期都限定在 Solana Devnet。 */}
      <div className="section-heading">
        <div>
          <span className="step">07</span>
          <h2>Solana Devnet 钱包、SOL 与 SPL Token</h2>
        </div>
        {connected && (
          <button
            className="secondary"
            disabled={disconnect.isRunning}
            onClick={() => disconnect.dispatch()}
            type="button"
          >
            断开 Solana 连接
          </button>
        )}
      </div>
      <p className="muted">
        本模块与 EVM 状态完全隔离。Wallet Standard
        用于发现兼容的浏览器钱包；支持 Devnet SOL、SPL Token、ATA
        派生、交易模拟和钱包签名。
      </p>

      {/* 恢复旧会话期间先等待；已连接显示账户，否则列出可用 Wallet Standard 钱包。 */}
      {status === 'pending' ? (
        <p className="muted">正在检查之前的 Solana 连接…</p>
      ) : connected ? (
        <>
          <dl className="facts">
            <div>
              <dt>Solana 账户</dt>
              <dd className="mono">{connected.account.address}</dd>
            </div>
            <div>
              <dt>钱包</dt>
              <dd>{connected.wallet.name}</dd>
            </div>
            <div>
              <dt>网络</dt>
              <dd>Solana Devnet</dd>
            </div>
            <SolBalance
              key={balanceVersion}
              owner={connected.account.address}
            />
          </dl>
          <form onSubmit={sendSol}>
            <label>
              收款地址
              <input
                autoComplete="off"
                onChange={(event) => setDestination(event.target.value)}
                placeholder="Solana 地址…"
                required
                spellCheck={false}
                value={destination}
              />
            </label>
            <label>
              金额（Devnet SOL）
              <input
                min="0.000000001"
                onChange={(event) => setAmount(event.target.value)}
                required
                step="0.000000001"
                type="number"
                value={amount}
              />
            </label>
            <button
              disabled={!connected.signer || !supportsDevnet || sending}
              type="submit"
            >
              发送 Devnet SOL
            </button>
          </form>
          {!supportsDevnet && (
            <p className="error">
              当前钱包不能用于本项目的 Solana Devnet
              交易。请断开后改用能够明确切换到 Devnet 的钱包，例如 Solflare。
            </p>
          )}
          {/* Solana 使用交易签名而非 EVM Hash，但展示相同的确认与错误概念。 */}
          <div className="lifecycle" aria-live="polite">
            <p>
              <span className="status-dot" />{' '}
              <strong>{transactionStatus}</strong>
            </p>
            {signature && (
              <p className="mono">
                交易签名：{' '}
                <a
                  href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
                  rel="noreferrer"
                  target="_blank"
                >
                  {signature}
                </a>
              </p>
            )}
            {transactionError && <p className="error">{transactionError}</p>}
          </div>

          <div className="teaching-card">
            <h3>SPL Token / ATA 转账</h3>
            <p className="muted">
              输入 Mint
              后读取当前钱包的关联代币账户（ATA）。转账会幂等创建收款方
              ATA，再执行
              TransferChecked；客户端默认先模拟计算量，随后才请求签名。
            </p>
            <form onSubmit={sendSpl}>
              <label>
                Token Mint（Devnet）
                <input
                  autoComplete="off"
                  onChange={(event) => setTokenMint(event.target.value)}
                  placeholder="SPL Token Mint 地址…"
                  required
                  spellCheck={false}
                  value={tokenMint}
                />
              </label>
              <button
                className="secondary"
                disabled={splLoading || !tokenMint.trim()}
                onClick={refreshSplAccount}
                type="button"
              >
                读取 Token 与 ATA
              </button>
              {splAccount && (
                <dl className="facts">
                  <div>
                    <dt>当前 ATA</dt>
                    <dd className="mono">{splAccount.ata}</dd>
                  </div>
                  <div>
                    <dt>Token 余额</dt>
                    <dd>
                      {formatUnits(splAccount.balance, splAccount.decimals)}{' '}
                      {process.env.NEXT_PUBLIC_SOLANA_TOKEN_SYMBOL?.trim() ||
                        'TOKEN'}
                    </dd>
                  </div>
                  <div>
                    <dt>精度</dt>
                    <dd>{splAccount.decimals}</dd>
                  </div>
                </dl>
              )}
              <label>
                收款钱包地址（不是 ATA）
                <input
                  autoComplete="off"
                  onChange={(event) => setTokenDestination(event.target.value)}
                  placeholder="Solana 钱包地址…"
                  required
                  spellCheck={false}
                  value={tokenDestination}
                />
              </label>
              <label>
                Token 数量
                <input
                  min="0.000000001"
                  onChange={(event) => setTokenAmount(event.target.value)}
                  required
                  step="any"
                  type="number"
                  value={tokenAmount}
                />
              </label>
              <button
                disabled={!connected.signer || !supportsDevnet || splLoading}
                type="submit"
              >
                模拟并发送 SPL Token
              </button>
            </form>
            <div className="lifecycle" aria-live="polite">
              <p>
                <span className="status-dot" /> <strong>{splStatus}</strong>
              </p>
              {splSignature && (
                <p className="mono">
                  交易签名：{' '}
                  <a
                    href={`https://explorer.solana.com/tx/${splSignature}?cluster=devnet`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {splSignature}
                  </a>
                </p>
              )}
              {splError && <p className="error">{splError}</p>}
            </div>
          </div>
        </>
      ) : (
        <div className="actions wallet-actions">
          {wallets.map((wallet) => (
            <button
              disabled={connect.isRunning}
              key={wallet.name}
              onClick={() => connect.dispatch(wallet)}
              type="button"
            >
              连接 {wallet.name}
            </button>
          ))}
          {wallets.length === 0 && (
            <p className="muted">
              未检测到可用于 Devnet 的 Solana Wallet Standard 钱包。MetaMask
              在本项目的通用 Wallet Standard 实测中会把签名请求显示为
              Mainnet，因此本模块暂不列出它；请安装并切换到 Devnet 的 Solflare
              等钱包。实验室的其他功能仍可正常使用。
            </p>
          )}
        </div>
      )}

      {Boolean(connect.error || disconnect.error) && (
        <p className="error">
          {getErrorMessage(
            connect.error || disconnect.error,
            'Solana Devnet',
            'Devnet SOL',
          )}
        </p>
      )}
    </section>
  )
}

// Provider 把预先组合的钱包与 RPC 插件注入所有 Solana hooks。
export default function SolanaPanel() {
  return (
    <ClientProvider client={solanaClient}>
      <SolanaWallet />
    </ClientProvider>
  )
}
