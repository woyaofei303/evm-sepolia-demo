'use client'

import { useQuery } from '@tanstack/react-query'
import {
  useBalance,
  useConnect,
  useConnection,
  useConnectors,
  useDisconnect,
  usePublicClient,
  useSwitchChain,
} from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { formatEther } from 'viem'

import { getErrorMessage } from '../../shared/errors'
import { walletConnectEnabled } from '../../shared/evm/config'

// 第 01 步只负责钱包连接和网络检查；后面的组件可通过 Wagmi 读取同一连接状态。
export function EvmWalletStep() {
  // useConnection 订阅当前活跃连接，账户地址、chainId 和连接状态变化会触发组件更新。
  // 已连接后的信息
  const connection = useConnection()

  // useConnectors 返回 Wagmi 配置中可用的连接方式，用来渲染浏览器扩展、WalletConnect 等按钮。
  // 可用来连接的钱包列表
  const connectors = useConnectors()

  // useConnect 发起连接请求，mutate 选择 connector 和目标链，isPending/error 描述这次请求。
  // 发起连接的方法，状态
  const connect = useConnect()

  // useDisconnect 断开 Wagmi 保存的当前连接，但不等同于在钱包中撤销站点授权。
  const disconnect = useDisconnect()

  // useSwitchChain 请求钱包切换到指定链，并暴露等待状态和用户拒绝等错误。
  const switchChain = useSwitchChain()
  const publicClient = usePublicClient({ chainId: sepolia.id })
  const rpcHealth = useQuery({
    queryKey: ['sepolia-rpc-health'],
    queryFn: async () => {
      if (!publicClient) throw new Error('Sepolia RPC 尚未准备完成。')
      const startedAt = performance.now()
      const blockNumber = await publicClient.getBlockNumber()
      return {
        blockNumber,
        latencyMs: Math.round(performance.now() - startedAt),
      }
    },
    enabled: Boolean(publicClient),
    refetchInterval: 15_000,
    retry: 1,
  })

  // useBalance 通过 RPC 查询地址的原生代币余额，并提供 data/isPending/error 等查询状态。
  // 这里固定 chainId，即使钱包在其他网络，也只读 Sepolia，避免把主网余额误当测试币。
  const balance = useBalance({
    address: connection.address,
    chainId: sepolia.id,
  })

  const onSepolia = connection.chainId === sepolia.id
  const connectionError = connect.error || switchChain.error

  return (
    <section>
      {/* 先连接账户，再确认 chainId；两项都正确后才进入后续交易步骤。 */}
      <div className="section-heading">
        <div>
          <span className="step">01</span>
          <h2>连接 EVM 钱包并锁定网络</h2>
        </div>
        {connection.isConnected && (
          <button
            className="secondary"
            disabled={disconnect.isPending}
            onClick={() => disconnect.mutate()}
            type="button"
          >
            断开连接
          </button>
        )}
      </div>

      {/* 每个 connector 代表一种钱包连接方式，例如浏览器扩展或 WalletConnect。 */}
      {!connection.isConnected && (
        <div className="actions wallet-actions">
          {connectors.map((connector) => (
            <button
              disabled={connect.isPending}
              key={connector.uid}
              onClick={() => connect.mutate({ connector, chainId: sepolia.id })}
              type="button"
            >
              {connect.isPending
                ? '连接中…'
                : `连接${connector.name === 'Injected' ? '浏览器扩展钱包' : ` ${connector.name}`}`}
            </button>
          ))}
        </div>
      )}
      {!walletConnectEnabled && (
        <p className="muted">
          浏览器扩展钱包不需要凭证。WalletConnect/Reown 为可选功能；设置{' '}
          <code>NEXT_PUBLIC_REOWN_PROJECT_ID</code> 后会增加二维码连接方式。
        </p>
      )}

      {/* 连接成功后，把账户、网络和测试币余额放在一起供学习者核对。 */}
      {connection.isConnected ? (
        <dl className="facts">
          <div>
            <dt>EVM 账户</dt>
            <dd className="mono">{connection.address}</dd>
          </div>
          <div>
            <dt>网络</dt>
            <dd>
              {onSepolia ? 'Sepolia' : `错误网络（${connection.chainId}）`}
            </dd>
          </div>
          <div>
            <dt>Sepolia 余额</dt>
            <dd>
              {balance.data
                ? `${formatEther(balance.data.value)} ${balance.data.symbol}`
                : balance.isPending
                  ? '读取中…'
                  : '暂时无法读取'}
            </dd>
          </div>
          <div>
            <dt>RPC 健康状态</dt>
            <dd>
              {rpcHealth.data
                ? `区块 ${rpcHealth.data.blockNumber} · ${rpcHealth.data.latencyMs}ms`
                : rpcHealth.error
                  ? `不可用：${getErrorMessage(rpcHealth.error)}`
                  : '探测中…'}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="muted">请连接 MetaMask、Rabby 等浏览器扩展钱包。</p>
      )}

      {/* 网络错误时锁住后续操作，并让钱包发起标准的切链请求。 */}
      {connection.isConnected && !onSepolia && (
        <div className="chain-alert">
          当前网络不正确，签名和交易操作已锁定。
          <button
            disabled={switchChain.isPending}
            onClick={() => switchChain.mutate({ chainId: sepolia.id })}
            type="button"
          >
            {switchChain.isPending ? '切换中…' : '切换到 Sepolia'}
          </button>
        </div>
      )}
      {connectionError && (
        <p className="error">{getErrorMessage(connectionError)}</p>
      )}
    </section>
  )
}
