// 根布局负责全站元数据、全局样式和 Web3/查询上下文。
import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { Providers } from './providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'Web3 钱包与行情实验室',
  description: 'EVM、Solana、Sui 与实时合约行情的 Next.js 演示',
}

// lang 帮助浏览器与辅助技术按中文处理页面内容。
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
