'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  useConnection,
  usePublicClient,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import { sepolia } from 'wagmi/chains'
import {
  erc20Abi,
  formatUnits,
  getAddress,
  isAddress,
  parseEventLogs,
  parseUnits,
  zeroAddress,
  type Hash,
} from 'viem'

import { getErrorMessage } from '../../shared/errors'
import { TransactionLifecycle } from '../../shared/evm/TransactionLifecycle'
import { LearningSwapPanel } from '../learning-swap/LearningSwapPanel'

/**
 * 小白先记住 ERC-20 面板的三类操作：
 *
 * 读取：浏览器 → Wagmi/Viem → Sepolia RPC → eth_call，不改链上数据，不花 Gas。
 * 模拟：RPC 节点用真实 EVM 状态预执行 approve/transfer，但不保存结果。
 * 写入：钱包展示请求 → 用户签名 → RPC 广播 → 验证者收录 → 产生回执和事件。
 *
 * erc20Abi 是 Viem 内置的标准 ERC-20 接口说明，它让页面可以按函数名编码调用、解码返回值和事件。
 * 这个面板可操作任意兼容的 Sepolia ERC-20；LearningToken.sol 只是仓库提供的最小练习合约。
 */

/**
 * tokenAddress 是 ERC-20 合约地址：所有读取、授权和转账都调用这个合约。
 * spenderAddress 是被授权方：它之后可通过 transferFrom 在额度内代扣代币，本页只练习授权，不执行 transferFrom。
 * NEXT_PUBLIC_* 会进入浏览器，只能放这类公开地址，绝不能放私钥。
 * 原始值用于判断是“没配置”还是“配置了错地址”；只有校验并标准化后的地址才会交给链上 API。
 */
const rawTokenAddress = process.env.NEXT_PUBLIC_ERC20_ADDRESS?.trim()
const rawSpenderAddress = process.env.NEXT_PUBLIC_ERC20_SPENDER_ADDRESS?.trim()
const tokenAddress =
  rawTokenAddress && isAddress(rawTokenAddress)
    ? getAddress(rawTokenAddress)
    : undefined
const spenderAddress =
  rawSpenderAddress && isAddress(rawSpenderAddress)
    ? getAddress(rawSpenderAddress)
    : undefined

export function Erc20Panel() {
  /**
   * useConnection 提供当前钱包地址和 chainId，但页面拿不到私钥。
   * 账户地址用于查余额/授权额度，也会成为模拟和真实交易的 msg.sender。
   */
  const connection = useConnection()
  /**
   * publicClient 是指向 Sepolia 公共 RPC 的 Viem 客户端，负责只读请求和交易模拟。
   * 它不保管账户、不能签名，因此模拟通过也不会自动发交易。
   */
  const publicClient = usePublicClient({ chainId: sepolia.id })

  // QueryClient 缓存 Wagmi 读取结果；交易确认后通过它标记旧余额/额度过期。
  const queryClient = useQueryClient()

  // useWriteContract 是写链入口；只有调用 mutateAsync 时才会把请求交给钱包签名。
  const writeContract = useWriteContract()

  // 三个字符串状态分别对应授权数量、转账收款地址和转账数量，使输入框受 React 控制。
  const [approveAmount, setApproveAmount] = useState('1')
  const [recipient, setRecipient] = useState('')
  const [transferAmount, setTransferAmount] = useState('0.01')

  // action 记录当前是授权还是转账，用于只在对应按钮上显示“请检查钱包”。
  const [action, setAction] = useState<'approve' | 'revoke' | 'transfer'>()

  // Hash 只证明交易已广播，还不证明执行成功；它会启动回执轮询。
  const [hash, setHash] = useState<Hash>()

  // actionError 收集校验、模拟、用户拒绝、钱包和广播阶段的错误。
  const [actionError, setActionError] = useState('')

  // 只有已连接钱包且当前网络是 Sepolia，页面才允许写代币合约。
  const canTransact =
    connection.isConnected && connection.chainId === sepolia.id

  /**
   * 页面操作 1：自动读取 symbol()。
   * symbol 是页面显示的代币缩写，例如 LearningToken 返回 SLT。
   * useReadContract 根据 erc20Abi 编码 symbol() calldata，通过 RPC eth_call 执行，再解码字符串结果。
   * enabled 确保 tokenAddress 有效后才发 RPC；读取不需要连接钱包，也不花 Gas。
   */
  const symbol = useReadContract({
    abi: erc20Abi,
    address: tokenAddress,
    chainId: sepolia.id,
    functionName: 'symbol',
    query: { enabled: Boolean(tokenAddress) },
  })

  /**
   * 页面操作 2：自动读取 decimals()。
   * 合约里的代币数量只存 uint256 整数，decimals 规定前端展示时小数点放在哪里。
   * 例如 decimals=18 时，用户看到的 1.5 代币对应链上整数 1_500_000_000_000_000_000。
   * 不能猜测所有代币都是 18 位，所以 decimals 未读到时页面会禁用写操作。
   */
  const decimals = useReadContract({
    abi: erc20Abi,
    address: tokenAddress,
    chainId: sepolia.id,
    functionName: 'decimals',
    query: { enabled: Boolean(tokenAddress) },
  })

  /**
   * 页面操作 3：读取 balanceOf(当前钱包)。
   * ERC-20 余额是 token 合约内部记录的账本，不是账户的 Sepolia ETH 余额。
   * balanceOf 返回最小单位的 bigint，页面稍后用 formatUnits(balance, decimals) 转为人类可读数量。
   * zeroAddress 只是账户未连接时的类型占位；enabled=false 会阻止真正查询零地址。
   */
  const balance = useReadContract({
    abi: erc20Abi,
    address: tokenAddress,
    args: [connection.address ?? zeroAddress],
    chainId: sepolia.id,
    functionName: 'balanceOf',
    query: { enabled: Boolean(tokenAddress && connection.address) },
  })

  /**
   * 页面操作 4：读取 allowance(owner, spender)。
   * allowance 是 token 合约中“所有者 → 支出方 → 剩余可代扣数量”的映射。
   * 它不是已转账金额，也不会锁住代币；spender 之后需要主动调用 transferFrom 才能使用额度。
   * 账户、代币地址或 spender 任意一项缺失时，enabled=false 会阻止 RPC。
   */
  const allowance = useReadContract({
    abi: erc20Abi,
    address: tokenAddress,
    args: [connection.address ?? zeroAddress, spenderAddress ?? zeroAddress],
    chainId: sepolia.id,
    functionName: 'allowance',
    query: {
      enabled: Boolean(tokenAddress && spenderAddress && connection.address),
    },
  })

  /**
   * 页面操作 5：授权或转账广播后自动等待交易回执。
   * useWaitForTransactionReceipt 在 Hash 存在后通过 Sepolia RPC 轮询 eth_getTransactionReceipt。
   * Hash 只代表“已广播”；回执才包含区块号、Gas 用量、success/reverted 和合约 logs。
   * 即使操作的是 ERC-20，Gas 仍由发起交易的钱包用 Sepolia ETH 支付，不是用代币支付。
   */
  const receipt = useWaitForTransactionReceipt({ chainId: sepolia.id, hash })

  /**
   * 页面操作 6：把回执里的 EVM logs 解码成 ERC-20 事件。
   * 链上 log 只有 topics/data 字节，parseEventLogs 需要 erc20Abi 才知道如何还原参数。
   * Transfer 说明哪个 from 向哪个 to 移动了 value；Approval 说明 owner 把 spender 额度设成了 value。
   * strict:false 让解析器忽略同一回执里不匹配 ERC-20 ABI 的其他日志，.at(-1) 只取最后一个可识别事件教学展示。
   * 事件里展示“原始数值”，因为 log 记录的是最小单位 uint256，还没用 decimals 格式化。
   */
  const tokenEvent = useMemo(() => {
    if (!receipt.data) return ''
    const event = parseEventLogs({
      abi: erc20Abi,
      logs: receipt.data.logs,
      strict: false,
    }).at(-1)
    if (event?.eventName === 'Transfer') {
      return `Transfer 事件：${event.args.from} → ${event.args.to}，原始数值 ${event.args.value}`
    }
    if (event?.eventName === 'Approval') {
      return `Approval 事件：所有者 ${event.args.owner}，支出方 ${event.args.spender}，原始数值 ${event.args.value}`
    }
    return ''
  }, [receipt.data])

  /**
   * 取到回执后，旧 balance/allowance 可能还在 TanStack Query 缓存中。
   * invalidateQueries 把缓存标记过期，Wagmi 随后重新发 eth_call，授权额度或余额才会显示最新链上结果。
   * receipt.isSuccess 只表示“回执查询成功”；交易是否执行成功仍要看 receipt.data.status。
   */
  useEffect(() => {
    if (!receipt.isSuccess) return
    // ponytail: 当前只有 Wagmi 读取；查询面扩大后再按生成的 query key 精确刷新。
    void queryClient.invalidateQueries()
  }, [queryClient, receipt.isSuccess])

  /**
   * 两个表单的共用写入流程：
   * 1. 记录操作类型，清空上一笔交易的错误和 Hash。
   * 2. 检查钱包、Sepolia、RPC 客户端、token 地址和 decimals 是否就绪。
   * 3. 把用户输入换算成合约使用的 uint256 最小单位。
   * 4. 先通过公共 RPC simulateContract，模拟通过后才把 request 交给钱包。
   * 5. 钱包确认、签名和广播后返回 Hash，回执 hook 再继续跟踪。
   */
  async function writeToken(kind: 'approve' | 'revoke' | 'transfer') {
    // action 决定哪个按钮显示“请检查钱包”；清掉旧 Hash 可避免上笔回执混入新流程。
    setAction(kind)
    setActionError('')
    setHash(undefined)
    try {
      // 这些校验与按钮 disabled 互相独立，避免状态切换瞬间绕过 UI 防护。
      if (!canTransact) throw new Error('请将钱包切换到 Sepolia 后重试。')
      if (!publicClient || !connection.address || !tokenAddress) {
        throw new Error('代币客户端尚未准备完成。')
      }
      if (decimals.data === undefined) {
        throw decimals.error ?? new Error('代币精度尚未读取完成。')
      }
      /**
       * parseUnits 是 formatUnits 的反向操作。例如 decimals=18 时，字符串“1.5”会转成 1500000000000000000n。
       * 必须使用字符串 + bigint，不能先转 JavaScript number，否则大金额可能丢失精度。
       * 当前 Viem 对超出 decimals 的小数位会四舍五入；如果结果为 0，下方校验会拒绝。
       */
      const amount =
        kind === 'revoke'
          ? 0n
          : parseUnits(
              kind === 'approve' ? approveAmount : transferAmount,
              decimals.data,
            )
      if (kind !== 'revoke' && amount <= 0n) throw new Error('金额必须大于零。')

      if (kind === 'approve' || kind === 'revoke') {
        /**
         * 页面操作 7：授权精确额度。
         * approve(spender, amount) 只修改 allowance 账本，不会立即移动代币、也不会把代币转到 spender。
         * 授权确认后，spender 可以在以后调用 transferFrom(owner, recipient, amount)，合约会检查并通常扣减额度。
         * 额度会持续存在，直到被修改或使用；给错 spender 就可能丢币，所以页面只演示精确数量，不自动授权 max uint256。
         * 生产中修改已有非零 allowance 还需要考虑代币兼容性与授权竞态，不应盲目重复 approve。
         */
        if (!spenderAddress) throw new Error('请配置有效的支出方地址。')
        // 模拟使用当前账户作为 msg.sender，成功后 request 内已编码 approve(spenderAddress, amount) calldata。
        const { request } = await publicClient.simulateContract({
          abi: erc20Abi,
          account: connection.address,
          address: tokenAddress,
          args: [spenderAddress, amount],
          functionName: 'approve',
        })
        // mutateAsync 会弹出钱包；用户确认后由钱包保管的私钥签名，页面只接收广播后的 Hash。
        setHash(await writeContract.mutateAsync(request))
      } else {
        /**
         * 页面操作 8：直接转账 ERC-20。
         * transfer(recipient, amount) 从当前 msg.sender 的 token 余额扣减，再增加 recipient 余额，它不使用上面的 allowance。
         * 收款地址会在模拟前再次校验和标准化；余额不足或 token 自定义规则拒绝时，模拟会 revert，不弹钱包。
         */
        if (!isAddress(recipient)) throw new Error('请输入有效的 0x 收款地址。')
        const { request } = await publicClient.simulateContract({
          abi: erc20Abi,
          account: connection.address,
          address: tokenAddress,
          args: [getAddress(recipient), amount],
          functionName: 'transfer',
        })
        setHash(await writeContract.mutateAsync(request))
      }
    } catch (error) {
      // getErrorMessage 把不同钱包/Viem/RPC 的错误归一成页面可读的中文提示。
      setActionError(getErrorMessage(error))
    }
  }

  /**
   * 派生状态只为展示和禁用条件服务：
   * tokenReady：只要 decimals 未读到，就不猜测精度、不允许发交易。
   * decimalsValue/symbolValue：在数据到达前保证渲染有稳定类型，不代表页面会用默认 0 精度发交易。
   * busy：正在等钱包，或已有 Hash 且正在等回执。两个表单共用一条生命周期，因此同时锁定。
   */
  const tokenReady = decimals.data !== undefined
  const decimalsValue = decimals.data ?? 0
  const symbolValue = symbol.data ?? '代币'
  const busy = writeContract.isPending || (receipt.isPending && Boolean(hash))

  return (
    <section>
      {/*
        页面入口先检查 token 合约地址。未配置时只显示启用方法，所有读取 hook 的 enabled 都是 false。
        spender 地址只是授权练习所需；不配置 spender 仍可读余额和使用直接 transfer。
      */}
      <span className="step">EVM-05</span>
      <h2>ERC-20 与 DeFi 基础操作</h2>
      {!tokenAddress ? (
        <p className="muted">
          可选代币流程尚未启用。将 <code>NEXT_PUBLIC_ERC20_ADDRESS</code> 设置为
          Sepolia ERC-20 地址；再设置{' '}
          <code>NEXT_PUBLIC_ERC20_SPENDER_ADDRESS</code> 可练习精确额度授权。
        </p>
      ) : (
        <>
          {/*
            信息区的目的是在写链前确认“正在操作哪个 token、自己有多少余额、指定 spender 还能代扣多少”。
            三项数据都来自 Sepolia 合约状态，不是前端自己计算的账本。
          */}
          <dl className="facts">
            {/* 代币地址是 ERC-20 合约地址，也是 approve/transfer 交易的 to，不是用户钱包地址。 */}
            <div>
              <dt>代币地址</dt>
              <dd className="mono">{tokenAddress}</dd>
            </div>
            {/*
              余额在未连钱包时无法知道查谁；连接后等待 balanceOf 和 decimals/symbol 分别返回。
              formatUnits 只改变展示小数点，不会改变链上真实整数余额。
            */}
            <div>
              <dt>代币余额</dt>
              <dd>
                {balance.data === undefined
                  ? connection.address
                    ? '读取中…'
                    : '请连接 EVM 钱包'
                  : !tokenReady
                    ? '正在读取代币信息…'
                    : `${formatUnits(balance.data, decimalsValue)} ${symbolValue}`}
              </dd>
            </div>
            {/*
              授权额度展示 allowance(当前钱包, spender)。未配置 spender 时不发 allowance RPC。
              这是“尚可被该 spender 通过 transferFrom 使用的上限”，不是 spender 的自有余额。
            */}
            <div>
              <dt>授权额度</dt>
              <dd>
                {!spenderAddress
                  ? '尚未配置支出方'
                  : allowance.data === undefined
                    ? '读取中…'
                    : !tokenReady
                      ? '正在读取代币信息…'
                      : `${formatUnits(allowance.data, decimalsValue)} ${symbolValue}`}
              </dd>
            </div>
          </dl>

          {/* 两个表单共享 writeContract、Hash 和回执，任一交易进行时 busy 会锁定另一个表单。 */}
          <div className="two-column">
            {/*
              授权表单的目的是设置 allowance，不是转账。
              submit 时 preventDefault 防止浏览器刷新页面，然后显式进入 writeToken('approve') 流程。
            */}
            <form
              onSubmit={(event: FormEvent) => {
                event.preventDefault()
                void writeToken('approve')
              }}
            >
              <h3>授权精确额度</h3>
              {/*
                输入的是人类可读数量，提交时才按 decimals 转成最小单位。
                type=number/min/step/required 提供浏览器基础校验；writeToken 仍会检查换算后金额必须大于 0。
              */}
              <label>
                授权数量（{symbolValue}）
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={approveAmount}
                  onChange={(event) => setApproveAmount(event.target.value)}
                  required
                />
              </label>
              {/* 缺 spender、错误网络、decimals 未就绪或任一交易忙碌时禁止授权。 */}
              <div className="actions">
                <button
                  type="submit"
                  disabled={
                    !spenderAddress || !canTransact || !tokenReady || busy
                  }
                >
                  {writeContract.isPending && action === 'approve'
                    ? '请检查钱包…'
                    : '模拟并授权'}
                </button>
                <button
                  className="secondary"
                  type="button"
                  disabled={
                    !spenderAddress ||
                    !canTransact ||
                    !tokenReady ||
                    !allowance.data ||
                    busy
                  }
                  onClick={() => void writeToken('revoke')}
                >
                  {writeContract.isPending && action === 'revoke'
                    ? '请检查钱包…'
                    : '撤销授权'}
                </button>
              </div>
            </form>

            {/*
              转账表单直接调用 token.transfer，从当前钱包的 token 余额转给 recipient。
              它不需要前面的 spender 配置，也不使用 allowance。
            */}
            <form
              onSubmit={(event: FormEvent) => {
                event.preventDefault()
                void writeToken('transfer')
              }}
            >
              <h3>转账代币</h3>
              {/* 收款地址在输入时先作为字符串保存，提交时才用 isAddress/getAddress 做信任边界校验。 */}
              <label>
                收款地址
                <input
                  value={recipient}
                  onChange={(event) => setRecipient(event.target.value)}
                  placeholder="0x…"
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
              </label>
              {/* 转账数量与授权数量使用同样的 decimals 换算，模拟会检查当前 token 余额和合约规则。 */}
              <label>
                转账数量（{symbolValue}）
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={transferAmount}
                  onChange={(event) => setTransferAmount(event.target.value)}
                  required
                />
              </label>
              {/* 连接 Sepolia、decimals 已读取且当前无其他交易时才允许提交；收款地址由 writeToken 再校验。 */}
              <button
                type="submit"
                disabled={!canTransact || !tokenReady || busy}
              >
                {writeContract.isPending && action === 'transfer'
                  ? '请检查钱包…'
                  : '模拟并转账'}
              </button>
            </form>
          </div>

          {/*
            交易生命周期区把多个底层状态翻译成流程：
            prompting=true：钱包正等用户确认；已有 hash：已广播；confirming=true：等待进区块；
            已有 receipt：展示区块、Gas 和 success/reverted；error：显示写入或回执 RPC 错误。
            Etherscan 链接用 Hash 独立查看真实链上记录，不必只信任本页面显示。
          */}
          <TransactionLifecycle
            hash={hash}
            prompting={writeContract.isPending}
            confirming={receipt.isPending && Boolean(hash)}
            receipt={receipt.data}
            error={
              actionError ||
              (receipt.error ? getErrorMessage(receipt.error) : undefined)
            }
          />
          {/* 回执中找到 Transfer/Approval 后展示解码结果；如果交易 revert 或没有匹配日志，tokenEvent 为空便不渲染。 */}
          {tokenEvent && <output className="result mono">{tokenEvent}</output>}
          {/* decimals 是金额换算的安全前提；读取失败时显式报错，同时 tokenReady=false 会锁住两个写入按钮。 */}
          {decimals.error && (
            <p className="error">
              代币信息错误：{getErrorMessage(decimals.error)}
            </p>
          )}
        </>
      )}

      {/*
        只要 token 或 spender 环境变量非空但地址无效，就显示配置错误。
        无效值不会传给 Wagmi/Viem，因此不会尝试读取错合约或给错地址授权。
      */}
      {(rawTokenAddress && !tokenAddress) ||
      (rawSpenderAddress && !spenderAddress) ? (
        <p className="error">配置的 ERC-20 或支出方地址无效。</p>
      ) : null}
      {/* 基础操作先建立余额、allowance、approve 和 transfer 概念，下面再把它们串成完整教学兑换。 */}
      <details>
        <summary>基础操作如何进入完整 DeFi 流程</summary>
        <p className="muted">
          ERC-20 余额说明你有多少代币，allowance
          说明指定合约最多能代扣多少，approve
          只修改额度而不转币。完整兑换还需要读取资金池报价、把滑点换算成最低到账、设置截止时间、模拟合约、请求签名、等待回执并重新读取储备；下一部分会实际执行这些步骤。
        </p>
      </details>
      {/* token 地址和 decimals 就绪后才挂载兑换，避免用猜测精度换算链上金额。 */}
      {tokenAddress && tokenReady && (
        <LearningSwapPanel
          tokenAddress={tokenAddress}
          tokenDecimals={decimalsValue}
          tokenSymbol={symbolValue}
          walletTokenBalance={balance.data}
        />
      )}
    </section>
  )
}
