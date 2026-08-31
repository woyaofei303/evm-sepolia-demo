// 组合 Next.js、TypeScript 与 Prettier 官方平面配置，避免重复维护规则。
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier/flat'

export default defineConfig([
  // 先启用 Next.js 性能/可访问性规则和 TypeScript 规则，再关闭与 Prettier 冲突项。
  ...nextVitals,
  ...nextTs,
  prettier,
  // 只检查项目源码，忽略框架产物、本地生成目录和原样分发的授权 vendor 包。
  globalIgnores([
    '.next/**',
    'out/**',
    'dist/**',
    'docs-tdd/**',
    'output-tdd/**',
    'public/charting_library/**',
    'next-env.d.ts',
  ]),
])
