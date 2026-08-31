// shared/evm 保存所有 EVM 功能共用的基础配置；createConfig 组合网络、钱包连接器和 RPC transport。
import { createConfig, http } from 'wagmi'
// sepolia 内置 chainId、代币、浏览器和默认公共 RPC 等网络元数据。
import { sepolia } from 'wagmi/chains'
// injected 连接 MetaMask/Rabby 等浏览器注入钱包；walletConnect 提供扫码连接。
import { injected, walletConnect } from 'wagmi/connectors'
import { fallback } from 'viem'

// NEXT_PUBLIC_* 会进入浏览器代码，这里只能填 Reown 的公开 project ID。
const reownProjectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID?.trim()
const configuredRpcUrls = [
  process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL?.trim(),
  process.env.NEXT_PUBLIC_SEPOLIA_RPC_FALLBACK_URL?.trim(),
].filter(
  (url, index, urls): url is string =>
    Boolean(url) && urls.indexOf(url) === index,
)

// 页面用这个布尔值决定是否显示“需先配置 WalletConnect”的提示。
export const walletConnectEnabled = Boolean(reownProjectId)

// 这个 config 会传给 WagmiProvider，其下的所有 Wagmi hooks 都共享这份配置。
export const config = createConfig({
  // chains 声明应用支持的网络；本实验只允许 Sepolia，避免测试交易误发。
  chains: [sepolia],
  connectors: [
    // 使页面可通过 EIP-1193 Provider 连接已安装的浏览器扩展钱包。
    injected(),
    // 配置 project ID 后才加入 WalletConnect；showQrModal 会在连接时打开内置二维码弹窗。
    ...(reownProjectId
      ? [walletConnect({ projectId: reownProjectId, showQrModal: true })]
      : []),
  ],
  // ssr 让 Wagmi 在 Next.js hydration 后再恢复钱包状态，避免服务端与浏览器首屏不一致。
  ssr: true,
  // transports 按 chainId 指定读链通道，useBalance/useReadContract 等 hooks 会使用它。
  transports: {
    // 配置地址按顺序失败转移，最后保留 Wagmi 的 Sepolia 默认公共端点。
    [sepolia.id]: configuredRpcUrls.length
      ? fallback([...configuredRpcUrls.map((url) => http(url)), http()])
      : http(),
  },
})
