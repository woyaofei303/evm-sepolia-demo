import { createDAppKit } from '@mysten/dapp-kit-react'
import { SuiGrpcClient } from '@mysten/sui/grpc'

export const SUI_DEVNET_RPC =
  process.env.NEXT_PUBLIC_SUI_RPC_URL?.trim() ||
  'https://fullnode.devnet.sui.io:443'

export const suiDAppKit = createDAppKit({
  defaultNetwork: 'devnet',
  networks: ['devnet'],
  slushWalletConfig: null,
  createClient: () =>
    new SuiGrpcClient({
      baseUrl: SUI_DEVNET_RPC,
      network: 'devnet',
    }),
})

export function readCounterValue(
  json: Record<string, unknown> | null | undefined,
): string | undefined {
  const value = json?.value
  return typeof value === 'string' && /^\d+$/.test(value)
    ? value
    : typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
      ? String(value)
      : undefined
}
