// Solana 功能把 Devnet 客户端与页面放在同一目录；这里组合钱包签名和 RPC 插件。
import { createClient } from '@solana/kit'
import { solanaRpc } from '@solana/kit-plugin-rpc'
import { walletSigner } from '@solana/kit-plugin-wallet'

export const solanaClient = createClient()
  // Wallet Standard 负责发现浏览器钱包，并把签名器限定到 Devnet。
  .use(
    walletSigner({
      chain: 'solana:devnet',
      filter: (wallet) =>
        isSolanaDevnetWalletSupported(wallet.name, wallet.chains),
    }),
  )
  .use(
    solanaRpc({
      // 允许覆盖公共 RPC；未配置时使用 Solana 官方 Devnet 端点。
      rpcUrl:
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() ||
        'https://api.devnet.solana.com',
    }),
  )

// 从实际客户端 Promise 推导类型，避免手工复制插件组合后的复杂泛型。
export type SolanaClient = Awaited<typeof solanaClient>

export function isSolanaDevnetWalletSupported(
  walletName: string,
  chains: readonly string[],
) {
  // ponytail: 当前 MetaMask + 通用 Wallet Standard 实测把签名路由到 Mainnet；该组合验证 Devnet 正常后删除名称过滤。
  return (
    chains.includes('solana:devnet') &&
    !walletName.toLowerCase().includes('metamask')
  )
}

// 在打开钱包前拦截确定会失败或只会浪费手续费的转账。
export function validateSolTransfer(
  balance: bigint,
  amount: bigint,
  source: string,
  destination: string,
) {
  if (balance <= amount) {
    throw new Error('insufficient funds for transfer amount and network fee')
  }
  if (source === destination) {
    throw new Error('destination matches source')
  }
}

export function validateSplTransfer(
  tokenBalance: bigint,
  amount: bigint,
  sourceOwner: string,
  destinationOwner: string,
) {
  if (amount <= 0n) throw new Error('token amount must be greater than zero')
  if (tokenBalance < amount) throw new Error('insufficient token funds')
  if (sourceOwner === destinationOwner) {
    throw new Error('destination matches source')
  }
}
