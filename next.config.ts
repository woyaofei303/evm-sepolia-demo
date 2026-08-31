// Next.js 构建配置：保持单仓库 Turbopack 根目录，并关闭自动生成的 agent 规则。
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 项目已有仓库级规则，不让 Next.js 生成重复规则文件。
  agentRules: false,
  // 显式固定根目录，避免父目录中的锁文件影响 Turbopack 项目识别。
  turbopack: { root: process.cwd() },
}

export default nextConfig
