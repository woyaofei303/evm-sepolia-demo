'use client'

// 客户端 Provider 把 Wagmi 与 TanStack Query 上下文一次性提供给整棵页面树。
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { WagmiProvider } from 'wagmi'

import { config } from '../shared/evm/config'

export function Providers({ children }: { children: ReactNode }) {
  // useState 保证每个浏览器会话只创建一个 QueryClient，重渲染不会清空缓存。
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // 减少切回窗口时的重复 RPC；链上读取最多保持 10 秒新鲜。
          queries: { refetchOnWindowFocus: false, staleTime: 10_000 },
        },
      }),
  )

  return (
    // WagmiProvider 必须包住 QueryClientProvider，供 Wagmi hooks 共享配置和缓存。
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}
