'use client'

import dynamic from 'next/dynamic'

import { CounterContractStep } from '../features/counter/CounterContractStep'
import { Erc20Panel } from '../features/erc20/Erc20Panel'
import { EvmWalletStep } from '../features/evm-wallet/EvmWalletStep'
import { MessageSigningStep } from '../features/evm-wallet/MessageSigningStep'
import { NativeTransferStep } from '../features/evm-wallet/NativeTransferStep'
import { MarketPanel } from '../features/market/MarketPanel'

// Solana 钱包依赖浏览器 API，因此关闭服务端渲染，避免服务器尝试初始化钱包。
const SolanaPanel = dynamic(() => import('../features/solana/SolanaPanel'), {
  ssr: false,
})

export function WalletLab() {
  return (
    <main>
      {/* 开始前先告诉学习者：这是测试网实验，不应该使用真实资金。 */}
      <header>
        <p className="eyebrow">Next.js · TypeScript · Wagmi · Kit</p>
        <h1>Web3 钱包前端学习实验室</h1>
        <p>
          在 Sepolia 和 Solana Devnet
          上练习接近生产形态的钱包与交易流程。只使用测试账户和测试资金。
        </p>
      </header>

      {/* 所有步骤都要遵守的安全底线：前端永远不需要助记词或私钥。 */}
      <aside className="warning" role="note">
        不要粘贴助记词或私钥。批准前逐项阅读钱包提示。公开环境变量不能用于保存秘密。
      </aside>

      {/* 01：先连接 EVM 钱包并切到 Sepolia，后面的 EVM 步骤才可以操作。 */}
      <EvmWalletStep />

      {/* 02：练习不花 Gas 的链下消息签名。 */}
      <MessageSigningStep />

      {/* 03：练习发送测试 ETH，并观察交易从提交到确认的过程。 */}
      <NativeTransferStep />

      {/* 04：练习读取、模拟和写入 Counter 智能合约。 */}
      <CounterContractStep />

      {/* 05：练习 ERC-20 余额、精确授权和转账。 */}
      <Erc20Panel />

      {/* 06：练习实时行情、盘口/K 线、批量渲染和断线重连。 */}
      <MarketPanel />

      {/* 07：练习 Solana Devnet 钱包、SOL、SPL Token 和 ATA。 */}
      <SolanaPanel />

      {/* 公共节点适合学习；真实项目应换成自己的公开客户端配置。 */}
      <footer>
        <p>
          公共 RPC 和 WebSocket 可能限流。需要稳定练习时请配置自己的公开客户端
          ID 或地址；不要在 <code>NEXT_PUBLIC_*</code> 变量中保存秘密。
        </p>
      </footer>
    </main>
  )
}
