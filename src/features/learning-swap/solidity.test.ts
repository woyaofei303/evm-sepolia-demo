import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import solc from 'solc'

// 测试与 LearningSwap 功能放在同一目录，但命令从项目根运行，contracts 和 node_modules 路径不变。
const projectRoot = process.cwd()
// 合约使用 Remix 能识别的带版本导入，本地 npm 包目录则没有 @5.6.1 后缀。
const versionedOpenZeppelinPrefix = '@openzeppelin/contracts@5.6.1/'

/**
 * solc 遇到 import 时会调用此函数读取源码。
 * 这里只做一件事：把 Remix 的固定版本路径映射到本地 node_modules 中已锁定的 OpenZeppelin 包。
 */
function resolveImport(importPath: string) {
  const localImport = importPath.startsWith(versionedOpenZeppelinPrefix)
    ? importPath.replace(
        versionedOpenZeppelinPrefix,
        '@openzeppelin/contracts/',
      )
    : importPath

  try {
    return {
      contents: readFileSync(
        path.join(projectRoot, 'node_modules', localImport),
        'utf8',
      ),
    }
  } catch {
    return { error: `找不到 Solidity 导入：${importPath}` }
  }
}

// 这个测试同时证明 Solidity 语法/导入可编译，以及生成 ABI 仍覆盖前端完整教学流程。
test('LearningToken and LearningSwap compile with the frontend contract interface', () => {
  // Standard JSON Input 要求每份 Solidity 源码以“文件名 → content”的形式传入。
  const sourceNames = ['LearningToken.sol', 'LearningSwap.sol']
  const sources = Object.fromEntries(
    sourceNames.map((name) => [
      name,
      {
        content: readFileSync(
          path.join(projectRoot, 'contracts', name),
          'utf8',
        ),
      },
    ]),
  )
  // outputSelection 只请求 ABI，不生成 bytecode 文件；测试不会部署合约，也不会产生构建产物。
  const output = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: 'Solidity',
        sources,
        settings: {
          outputSelection: { '*': { '*': ['abi'] } },
        },
      }),
      { import: resolveImport },
    ),
  )
  // solc 也可能返回 warning；只有 severity=error 才代表合约无法编译。
  const compilerErrors = (output.errors ?? []).filter(
    (error: { severity: string }) => error.severity === 'error',
  )

  assert.deepEqual(
    compilerErrors,
    [],
    compilerErrors
      .map((error: { formattedMessage: string }) => error.formattedMessage)
      .join('\n'),
  )

  // 编译成功后读取真实生成的 ABI，防止 Solidity 函数改名而手写前端 ABI 没有同步。
  const abi = output.contracts['LearningSwap.sol'].LearningSwap.abi as Array<{
    name?: string
  }>
  const names = abi.flatMap((item) => (item.name ? [item.name] : []))

  // 这里只锁定页面依赖的公共接口；内部 helper 如何重构不会让测试无意义地失败。
  for (const name of [
    'Initialized',
    'Swap',
    'Closed',
    'getReserves',
    'quoteTokenForEth',
    'quoteEthForToken',
    'initialize',
    'swapTokenForEth',
    'swapEthForToken',
    'close',
  ]) {
    assert.ok(names.includes(name), `LearningSwap ABI 缺少 ${name}`)
  }
})
