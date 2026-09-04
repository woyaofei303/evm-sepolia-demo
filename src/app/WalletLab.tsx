'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'

import { CounterContractStep } from '../features/counter/CounterContractStep'
import { Erc20Panel } from '../features/erc20/Erc20Panel'
import { EvmWalletStep } from '../features/evm-wallet/EvmWalletStep'
import { MessageSigningStep } from '../features/evm-wallet/MessageSigningStep'
import { NativeTransferStep } from '../features/evm-wallet/NativeTransferStep'
import { MarketPanel } from '../features/market/MarketPanel'

const SolanaPanel = dynamic(() => import('../features/solana/SolanaPanel'), {
  ssr: false,
})
const SuiPanel = dynamic(() => import('../features/sui/SuiPanel'), {
  ssr: false,
})

const tabs = [
  { id: 'evm', label: 'EVM Sepolia' },
  { id: 'solana', label: 'Solana Devnet' },
  { id: 'sui', label: 'Sui Devnet' },
  { id: 'market', label: '行情' },
] as const

type TabId = (typeof tabs)[number]['id']

export function WalletLab() {
  const [activeTab, setActiveTab] = useState<TabId>('evm')

  return (
    <main>
      <header className="hero">
        <p className="eyebrow">
          Multi-chain wallet lab · Exchange-grade market
        </p>
        <h1>Web3 钱包与行情实验室</h1>
        <p>
          分链阅读 EVM Sepolia、Solana Devnet、Sui Devnet 的完整交互；行情页保留
          TradingView Advanced Charts，并按主线程压力自动降级。
        </p>
      </header>

      <aside className="warning" role="note">
        仅使用测试账户和测试币。不要粘贴助记词或私钥；公开环境变量只能保存
        RPC、合约和对象地址。
      </aside>

      <nav aria-label="链与行情模块" className="chain-tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            aria-controls={`panel-${tab.id}`}
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'tab-active' : ''}
            id={`tab-${tab.id}`}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div
        aria-labelledby={`tab-${activeTab}`}
        className="tab-panel"
        id={`panel-${activeTab}`}
        role="tabpanel"
      >
        {activeTab === 'evm' && (
          <>
            <EvmWalletStep />
            <MessageSigningStep />
            <NativeTransferStep />
            <CounterContractStep />
            <Erc20Panel />
          </>
        )}
        {activeTab === 'solana' && <SolanaPanel />}
        {activeTab === 'sui' && <SuiPanel />}
        {activeTab === 'market' && <MarketPanel />}
      </div>

      <footer>
        <p>
          公共 RPC 与交易所公共 API
          可能限流。真实项目应配置稳定节点和服务端监控，但
          <code>NEXT_PUBLIC_*</code> 中仍不可保存秘密。
        </p>
      </footer>
    </main>
  )
}
