'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import {
  useConnection,
  useReadContract,
  useSimulateContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { getAddress, isAddress, parseEventLogs, type Hash } from 'viem'

import { getErrorMessage } from '../../shared/errors'
import { TransactionLifecycle } from '../../shared/evm/TransactionLifecycle'
import { counterAbi } from './counterAbi'

/**
 * 小白先记住这个页面的两条路径：
 *
 * 读取/模拟：浏览器 → Wagmi/Viem → 公共 RPC 节点 → 在节点中执行 eth_call
 * 写入：    浏览器 → 钱包弹窗 → 用户签名 → RPC 广播 → 交易池 → 区块 → 回执
 *
 * RPC 可以理解为“向区块链节点发请求的 HTTP 接口”。
 * ABI 是合约接口说明书，Viem 用它把函数名/参数编码成字节，再把返回值/事件解码回可读数据。
 */

/**
 * 页面必须先知道 Counter 部署在 Sepolia 的地址，才知道 RPC 请求要访问哪个合约。
 * NEXT_PUBLIC_* 会被打包到浏览器，所以它只能放公开的合约地址，不能放私钥。
 * rawCounterAddress 保留用户原始配置，便于区分“没配置”和“配置错误”。
 * counterAddress 只保留通过 isAddress 校验、再经 getAddress 标准化的地址。
 */
const rawCounterAddress = process.env.NEXT_PUBLIC_COUNTER_ADDRESS?.trim()
const counterAddress =
  rawCounterAddress && isAddress(rawCounterAddress)
    ? getAddress(rawCounterAddress)
    : undefined

// 第 04 步把一次完整合约操作拆成“读取 → 模拟 → 写入 → 等待回执 → 解析事件”。
export function CounterContractStep() {
  /**
   * QueryClient 是前端查询缓存，不是区块链节点。Wagmi 把读取结果放进缓存，减少重复 RPC。
   * 交易进入区块后，页面用它标记旧数据过期，让 number/owner 再次从链上读取。
   */
  const queryClient = useQueryClient()

  /**
   * useConnection 只读取 Wagmi 已连接的账户和网络，页面拿不到钱包私钥。
   * address 会成为模拟和真实交易里的 msg.sender；chainId 用来防止把 Sepolia 操作发到其他网络。
   */
  const connection = useConnection()
  // onSepolia 检查“当前钱包网络”；canTransact 要求既连接账户，又连到 Sepolia。
  const onSepolia = connection.chainId === sepolia.id
  const canTransact = connection.isConnected && onSepolia

  /**
   * 页面操作 1：自动读取“当前数值”。
   *
   * 1. Viem 根据 counterAbi 把 number() 编码成 EVM 识别的 calldata。
   * 2. Wagmi 通过 config.ts 里的 Sepolia RPC 发送 eth_call。
   * 3. RPC 节点在最新区块状态上执行 number()，但不创建交易、不改变存储、不花 Gas。
   * 4. Viem 再根据 ABI 把返回的 32 字节 uint256 解码成 bigint。
   *
   * enabled 是开关：未配置有效合约地址时，连 RPC 请求都不发。
   */
  const counterRead = useReadContract({
    abi: counterAbi,
    address: counterAddress,
    chainId: sepolia.id,
    functionName: 'number',
    query: { enabled: Boolean(counterAddress) },
  })

  /**
   * 页面操作 2：自动读取“合约 owner”。
   * Counter.sol 的 public owner 会由 Solidity 自动生成 owner() getter。读取过程与 number() 相同，
   * 但返回类型是 address。页面显示它，是为了让用户先确认谁有权调用 setNumber。
   * 两个读取是独立查询，其中一个失败不会覆盖另一个的状态。
   */
  const counterOwner = useReadContract({
    abi: counterAbi,
    address: counterAddress,
    chainId: sepolia.id,
    functionName: 'owner',
    query: { enabled: Boolean(counterAddress) },
  })

  /**
   * 页面操作 3：在用户点击“递增”前自动预检 increment()。
   *
   * 模拟仍是 RPC eth_call：节点会用真实 EVM 字节码跑一遍，但执行结果不会写入区块链。
   * account 会被当成 msg.sender，所以 require 权限、参数编码和合约 revert 可以在弹钱包前被发现。
   * increment() 成功时，Wagmi 返回 data.request，里面已有合约地址、账户、链和 ABI 编码后的 calldata。
   *
   * 模拟通过不等于最终必然成功：模拟后链上状态、账户余额或 Gas 条件仍可能变化。
   */
  const incrementSimulation = useSimulateContract({
    abi: counterAbi,
    account: connection.address,
    address: counterAddress,
    chainId: sepolia.id,
    functionName: 'increment',
    query: {
      enabled: Boolean(counterAddress && connection.address && onSepolia),
    },
  })

  /**
   * 页面操作 4：输入 owner 想直接设置的数值。
   * targetNumber 保留输入框的字符串；每次输入都会更新 React 状态并触发新的 setNumber 模拟。
   * Solidity 要求 uint256，所以先用十进制整数规则拦截空值、负数和小数。
   * BigInt 能精确表示 uint256 大整数；JavaScript number 超过安全范围会丢失精度。
   * 如果大到超出 uint256 范围，ABI 编码/模拟会报错，同样不会产生可发送的 request。
   */
  const [targetNumber, setTargetNumber] = useState('0')
  const targetNumberIsValid = /^\d+$/.test(targetNumber)
  // 无效输入时传 0n 只是为了保持 args 类型稳定；enabled=false 会阻止它真正发起模拟。
  const targetNumberValue = targetNumberIsValid ? BigInt(targetNumber) : 0n

  /**
   * 页面操作 5：对当前输入自动预检 setNumber(targetNumberValue)。
   * args 是传给合约函数的参数，Viem 会按 ABI 把 bigint 编码成 32 字节 uint256。
   * Counter.sol 内部会检查 msg.sender == owner，因此非 owner 账户的模拟会 revert，按钮也不会开放。
   * enabled 要求合约地址、账户、Sepolia 网络和整数输入全部有效，缺一项就不请求 RPC。
   */
  const setNumberSimulation = useSimulateContract({
    abi: counterAbi,
    account: connection.address,
    address: counterAddress,
    args: [targetNumberValue],
    chainId: sepolia.id,
    functionName: 'setNumber',
    query: {
      enabled: Boolean(
        counterAddress &&
        connection.address &&
        onSepolia &&
        targetNumberIsValid,
      ),
    },
  })

  /**
   * useWriteContract 是真正的写链入口，但声明 hook 本身不会发交易，只有后面调用 mutateAsync 才会执行：
   * 1. Wagmi 把模拟生成的 request 交给已连接的 MetaMask/Rabby/WalletConnect。
   * 2. 钱包展示合约地址、Gas 等信息，由用户确认或拒绝。
   * 3. 用户确认后，钱包在本地用私钥签名；私钥始终不会交给本页面。
   * 4. 钱包通过 RPC 广播交易，节点验证签名/余额/nonce 后把它放入交易池。
   */
  const writeContract = useWriteContract()

  /**
   * mutateAsync 在交易被广播后返回 Hash，它是交易内容的唯一指纹。
   * 拿到 Hash 只表示“已提交”，不表示“已成功”；Sepolia 验证者还需要把交易收录进区块。
   * 页面用 Hash 生成 Etherscan 链接，也用它启动下方的回执查询。
   */
  const [hash, setHash] = useState<Hash>()

  // contractError 收集点击后的本地预检、用户拒绝、钱包和发送错误；回执查询错误由 receipt.error 单独提供。
  // getErrorMessage 会把不同钱包/Viem/RPC 的错误形状归一成页面可读的中文消息。
  const [contractError, setContractError] = useState('')

  /**
   * 页面操作 6：广播后自动等待交易回执。
   * useWaitForTransactionReceipt 在 Hash 存在后通过 RPC 轮询 eth_getTransactionReceipt。
   * 未进区块时 RPC 返回空；收录后返回区块号、Gas 用量、status 和 logs。
   * status=success 表示 EVM 执行完成；status=reverted 表示已花 Gas，但合约状态修改被回滚。
   */
  const receipt = useWaitForTransactionReceipt({
    chainId: sepolia.id,
    hash,
  })

  /**
   * 页面操作 7：把回执中的 EVM 日志翻译成人能读懂的事件。
   * 合约 emit 时不会在 logs 中保存 JavaScript 对象，只保存 topics 和 data 字节。
   * 第一个 topic 标识事件签名，indexed caller 在 topic 中，newValue 在 data 中。
   * parseEventLogs 借助 counterAbi 恢复 eventName、caller 和 newValue；缺少或写错 ABI 就无法正确解码。
   * useMemo 让同一份回执只解析一次，然后分别寻找 Incremented 和 NumberSet。
   */
  const incrementEvent = useMemo(() => {
    if (!receipt.data) return undefined
    return parseEventLogs({
      abi: counterAbi,
      logs: receipt.data.logs,
    }).find((event) => event.eventName === 'Incremented')
  }, [receipt.data])

  const numberSetEvent = useMemo(() => {
    if (!receipt.data) return undefined
    return parseEventLogs({
      abi: counterAbi,
      logs: receipt.data.logs,
    }).find((event) => event.eventName === 'NumberSet')
  }, [receipt.data])

  /**
   * 回执查询完成后，链上状态可能已变，但 TanStack Query 缓存里还可能是旧 number。
   * invalidateQueries 只是把前端缓存标记为过期；Wagmi 随后会重新发 eth_call，所以页面才会显示最新数值。
   * receipt.isSuccess 表示“成功取到回执”，交易本身是否成功仍要看 receipt.data.status。
   */
  useEffect(() => {
    if (!receipt.isSuccess) return
    // ponytail: 当前只有一个 Wagmi 查询域；加入无关查询后再按 query key 精确刷新。
    void queryClient.invalidateQueries()
  }, [queryClient, receipt.isSuccess])

  /**
   * 用户点击“模拟通过后递增”时执行：
   * 1. 清空上一次错误和 Hash，让生命周期回到本次操作。
   * 2. 再次确认模拟 request 存在；这是按钮 disabled 之外的防御，避免状态切换瞬间发送空请求。
   * 3. mutateAsync 把已编码的 request 交给钱包确认、签名和广播。
   * 4. 广播成功就保存 Hash；拒绝、余额不足、网络或 RPC 错误则进入 catch。
   */
  async function handleIncrement() {
    setContractError('')
    setHash(undefined)
    try {
      if (!incrementSimulation.data?.request) {
        throw incrementSimulation.error ?? new Error('合约模拟尚未准备完成。')
      }
      setHash(await writeContract.mutateAsync(incrementSimulation.data.request))
    } catch (error) {
      setContractError(getErrorMessage(error))
    }
  }

  /**
   * 用户点击“模拟通过后设置数值”时执行。
   * 流程与 increment 相同，差别是它发送 setNumberSimulation 生成的 request，其 calldata 包含输入数值。
   * 两个操作共用 writeContract、Hash 和回执展示，因此一次只允许跟踪一笔写入交易。
   */
  async function handleSetNumber() {
    setContractError('')
    setHash(undefined)
    try {
      if (!setNumberSimulation.data?.request) {
        throw (
          setNumberSimulation.error ??
          new Error('设置数值的合约模拟尚未准备完成。')
        )
      }
      setHash(await writeContract.mutateAsync(setNumberSimulation.data.request))
    } catch (error) {
      setContractError(getErrorMessage(error))
    }
  }

  return (
    <section>
      {/*
        页面入口：先检查是否有有效合约地址。
        “部署合约”是把 Counter 字节码写入 Sepolia，部署交易确认后才会产生合约地址。
        未配置时，下方 hooks 的 enabled 为 false，页面不会向空地址发 RPC 请求。
      */}
      <span className="step">EVM-04</span>
      <h2>读取、模拟并写入 Counter 合约</h2>
      {!counterAddress ? (
        <p className="muted">
          可选合约流程尚未启用。请部署 <code>contracts/Counter.sol</code>
          ，然后设置 <code>NEXT_PUBLIC_COUNTER_ADDRESS</code>
          。钱包连接、消息签名和原生转账仍可使用。
        </p>
      ) : (
        <>
          {/*
            状态区的目的是让用户在写入前确认“要操作哪个合约、当前值是什么、谁有权设置、预检是否通过”。
            dl/dt/dd 只负责语义化展示，真正数据来自上方的 RPC 查询和模拟 hooks。
          */}
          <dl className="facts">
            {/* 合约地址是交易的 to，不是当前用户钱包地址。 */}
            <div>
              <dt>合约地址</dt>
              <dd className="mono">{counterAddress}</dd>
            </div>
            {/*
              当前数值展示 number() 查询的三种状态：请求中、请求失败、成功数据。
              bigint 不能直接当普通文本渲染，所以用 toString() 转成十进制字符串。
            */}
            <div>
              <dt>当前数值</dt>
              <dd>
                {counterRead.isPending
                  ? '读取中…'
                  : counterRead.isError
                    ? getErrorMessage(counterRead.error)
                    : counterRead.data?.toString()}
              </dd>
            </div>
            {/* owner 是部署合约时的 msg.sender，Counter.sol 只允许该地址调用 setNumber。 */}
            <div>
              <dt>合约 owner</dt>
              <dd className="mono">
                {counterOwner.isPending
                  ? '读取中…'
                  : counterOwner.isError
                    ? getErrorMessage(counterOwner.error)
                    : counterOwner.data}
              </dd>
            </div>
            {/*
              “交易预检”此处专门展示 incrementSimulation：
              未连接 Sepolia 时不执行；连接后显示模拟中、已通过或 revert/RPC 错误。
              setNumber 的模拟结果则直接体现为下方“设置数值”按钮是否可点。
            */}
            <div>
              <dt>交易预检</dt>
              <dd>
                {incrementSimulation.isPending && canTransact
                  ? '模拟中…'
                  : incrementSimulation.isSuccess
                    ? '已通过'
                    : incrementSimulation.error
                      ? getErrorMessage(incrementSimulation.error)
                      : '请连接 Sepolia 钱包'}
              </dd>
            </div>
          </dl>

          {/* 操作区按“手动重读 → 递增 → 输入目标值 → owner 设置”排列。 */}
          <div className="actions">
            {/*
              “刷新读取结果”只手动 refetch number() 查询，不发交易、不弹钱包、不花 Gas。
              isFetching 期间禁用按钮，避免用户并发多个相同 RPC 请求。
            */}
            <button
              className="secondary"
              disabled={counterRead.isFetching}
              onClick={() => void counterRead.refetch()}
              type="button"
            >
              刷新读取结果
            </button>
            {/*
              “模拟通过后递增”的目的是调用 Counter.increment()，任意账户都可以把 number 加 1。
              只有连接 Sepolia、模拟已生成 request、当前没有等待钱包的写入时才能点击。
              点击后先弹钱包，用户确认才会签名和广播；只是模拟通过不会自动写链。
            */}
            <button
              disabled={
                !canTransact ||
                !incrementSimulation.data?.request ||
                writeContract.isPending
              }
              onClick={handleIncrement}
              type="button"
            >
              {writeContract.isPending ? '请检查钱包…' : '模拟通过后递增'}
            </button>
            {/*
              输入框用来准备 setNumber(uint256)。它是受控输入：value 来自 React 状态，onChange 把新值写回状态。
              type=number/min/step 提供浏览器输入提示；真正决定能否调用的是上方整数校验和 setNumberSimulation。
              修改输入不会产生交易，只会以新参数重新模拟。
            */}
            <label>
              设置数值（仅 owner）
              <input
                min="0"
                onChange={(event) => setTargetNumber(event.target.value)}
                required
                step="1"
                type="number"
                value={targetNumber}
              />
            </label>
            {/*
              “模拟通过后设置数值”会调用 Counter.setNumber(targetNumberValue)。
              只有 owner 的模拟能通过；非 owner 会命中 Solidity require 并 revert，因而拿不到 request，按钮保持禁用。
              点击后仍要用户在钱包确认，并支付 Sepolia 测试 ETH 作为 Gas。
            */}
            <button
              disabled={
                !canTransact ||
                !setNumberSimulation.data?.request ||
                writeContract.isPending
              }
              onClick={handleSetNumber}
              type="button"
            >
              {writeContract.isPending ? '请检查钱包…' : '模拟通过后设置数值'}
            </button>
          </div>

          {/*
            交易生命周期区把多个底层状态合并成小白可读的步骤：
            prompting=true：钱包已弹出，等待用户确认；
            已有 hash：节点已接收交易，可以去 Sepolia Etherscan 查看；
            confirming=true：正在等待交易进入区块；
            已有 receipt：展示区块号、Gas 用量和 success/reverted；
            error：优先展示本地/钱包错误，否则展示回执 RPC 查询错误。
          */}
          <TransactionLifecycle
            confirming={receipt.isPending && Boolean(hash)}
            error={
              contractError ||
              (receipt.error ? getErrorMessage(receipt.error) : undefined)
            }
            hash={hash}
            prompting={writeContract.isPending}
            receipt={receipt.data}
          />
          {/*
            increment 交易确认后，如果回执包含 Incremented log，就展示调用者和递增后的新值。
            事件是合约主动留下的结构化链上记录，适合前端/索引器追踪发生过什么；它不代替 number 存储本身。
          */}
          {incrementEvent && (
            <output className="result mono">
              Incremented 事件：调用者 {incrementEvent.args.caller}，新数值{' '}
              {incrementEvent.args.newValue.toString()}
            </output>
          )}
          {/* setNumber 交易会以相同方式展示 NumberSet log，证明哪个 owner 把数值设成了什么。 */}
          {numberSetEvent && (
            <output className="result mono">
              NumberSet 事件：调用者 {numberSetEvent.args.caller}，新数值{' '}
              {numberSetEvent.args.newValue.toString()}
            </output>
          )}
        </>
      )}
      {/*
        只有“环境变量非空，但不是有效 EVM 地址”时才显示这条错误。
        拦截后 counterAddress 为 undefined，所有合约 hooks 都不会把错误地址发给 RPC。
      */}
      {rawCounterAddress && !counterAddress && (
        <p className="error">
          NEXT_PUBLIC_COUNTER_ADDRESS 不是有效的 EVM 地址。
        </p>
      )}
    </section>
  )
}
