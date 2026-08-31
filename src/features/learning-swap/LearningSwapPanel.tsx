'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  useBalance,
  useConnection,
  usePublicClient,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import { sepolia } from 'wagmi/chains'
import {
  erc20Abi,
  formatEther,
  formatUnits,
  parseEventLogs,
  parseUnits,
  zeroAddress,
  type Address,
  type Hash,
} from 'viem'

import { getErrorMessage } from '../../shared/errors'
import { TransactionLifecycle } from '../../shared/evm/TransactionLifecycle'
import {
  learningSwapAbi,
  rawSwapAddress,
  swapAddress,
} from './learningSwapContract'
import { LearningSwapGuide } from './LearningSwapGuide'
import {
  DEFAULT_SLIPPAGE,
  maximumTransactionCost,
  minimumAmountOut,
  parseSlippageBps,
} from './slippage'

// direction 决定输入/输出资产；action 只用于标记当前交易阶段和选择正确的事件解释。
type SwapDirection = 'tokenToEth' | 'ethToToken'
type SwapAction =
  | 'approve-initialization'
  | 'initialize'
  | 'approve-swap'
  | 'swap-token'
  | 'swap-eth'
  | 'close'

/**
 * 输入框始终保存字符串，提交前才按资产 decimals 转为 bigint 最小单位。
 * 无效、负数和舍入后为零都返回 undefined，让报价 hook 和按钮保持禁用。
 */
function parsePositiveAmount(value: string, decimals: number) {
  try {
    const amount = parseUnits(value, decimals)
    return amount > 0n ? amount : undefined
  } catch {
    return undefined
  }
}

// EVM 地址大小写可能因 checksum 不同；比较身份时统一小写，但仍要求两边都真实存在。
function sameAddress(left?: Address, right?: Address) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase())
}

/**
 * 父组件已经读取 token 地址、精度、符号和钱包余额，这里直接复用，避免重复 balanceOf RPC。
 * 本组件只负责资金池特有的状态、allowance、报价与写交易。
 */
type LearningSwapPanelProps = {
  tokenAddress: Address
  tokenDecimals: number
  tokenSymbol: string
  walletTokenBalance?: bigint
}

export function LearningSwapPanel({
  tokenAddress,
  tokenDecimals,
  tokenSymbol,
  walletTokenBalance,
}: LearningSwapPanelProps) {
  /**
   * 钱包只负责账户、网络和签名；publicClient 只通过 Sepolia RPC 做读取与模拟，不能替用户签名。
   * 这种分离保证页面永远不接触私钥，也解释了为什么“看到报价”不弹钱包、“执行兑换”必须弹钱包。
   */
  const connection = useConnection()
  const publicClient = usePublicClient({ chainId: sepolia.id })
  const queryClient = useQueryClient()
  const writeContract = useWriteContract()

  // 环境变量只是地址字符串。先用 eth_getCode 确认该 Sepolia 地址确实部署了字节码，再调用 ABI。
  const contractCode = useQuery({
    queryKey: ['learning-swap-code', sepolia.id, swapAddress],
    queryFn: async () => {
      if (!publicClient || !swapAddress) {
        throw new Error('教学兑换 RPC 客户端尚未准备完成。')
      }
      return publicClient.getCode({ address: swapAddress })
    },
    enabled: Boolean(publicClient && swapAddress),
    staleTime: Number.POSITIVE_INFINITY,
  })
  const hasContractCode = Boolean(
    contractCode.data && contractCode.data !== '0x',
  )

  /**
   * 下面五项都是 eth_call：RPC 节点在本地 EVM 中读取状态，不产生交易、不花 Gas、不需要钱包签名。
   * token() 还用于防止把页面配置的 SLT 误连到另一个交易对；地址不匹配时所有写操作都会锁住。
   */
  const owner = useReadContract({
    abi: learningSwapAbi,
    address: swapAddress,
    chainId: sepolia.id,
    functionName: 'owner',
    query: { enabled: hasContractCode },
  })
  const poolToken = useReadContract({
    abi: learningSwapAbi,
    address: swapAddress,
    chainId: sepolia.id,
    functionName: 'token',
    query: { enabled: hasContractCode },
  })
  const initialized = useReadContract({
    abi: learningSwapAbi,
    address: swapAddress,
    chainId: sepolia.id,
    functionName: 'initialized',
    query: { enabled: hasContractCode },
  })
  const closed = useReadContract({
    abi: learningSwapAbi,
    address: swapAddress,
    chainId: sepolia.id,
    functionName: 'closed',
    query: { enabled: hasContractCode },
  })
  const reserves = useReadContract({
    abi: learningSwapAbi,
    address: swapAddress,
    chainId: sepolia.id,
    functionName: 'getReserves',
    query: { enabled: hasContractCode },
  })

  const tokenMatches = sameAddress(poolToken.data, tokenAddress)
  // configurationReady 同时要求地址有字节码且合约绑定正确 token；任何写入口还会再次检查。
  const configurationReady = hasContractCode && tokenMatches
  const onSepolia = connection.chainId === sepolia.id
  const canTransact = connection.isConnected && onSepolia
  const isOwner = sameAddress(owner.data, connection.address)
  const poolActive =
    configurationReady && initialized.data === true && closed.data === false

  /** allowance 是“当前钱包允许资金池代扣多少 token”，余额仍属于钱包，approve 本身不会移动 token。 */
  const allowance = useReadContract({
    abi: erc20Abi,
    address: tokenAddress,
    args: [connection.address ?? zeroAddress, swapAddress ?? zeroAddress],
    chainId: sepolia.id,
    functionName: 'allowance',
    query: {
      enabled: Boolean(configurationReady && connection.address && swapAddress),
    },
  })
  const ethBalance = useBalance({
    address: connection.address,
    chainId: sepolia.id,
    query: { enabled: Boolean(connection.address) },
  })

  // 初始化金额由 owner 决定初始储备比例，也就决定这个独立教学池的初始价格。
  const [initialToken, setInitialToken] = useState('100')
  const [initialEth, setInitialEth] = useState('0.1')
  const initialTokenAmount = useMemo(
    () => parsePositiveAmount(initialToken, tokenDecimals),
    [initialToken, tokenDecimals],
  )
  const initialEthAmount = useMemo(
    () => parsePositiveAmount(initialEth, 18),
    [initialEth],
  )

  // 兑换方向只改变输入精度、报价函数和最终调用；两条路径使用同一组保护参数。
  const [direction, setDirection] = useState<SwapDirection>('tokenToEth')
  const [swapAmount, setSwapAmount] = useState('1')
  const [slippage, setSlippage] = useState(DEFAULT_SLIPPAGE)
  const swapAmountIn = useMemo(
    () =>
      parsePositiveAmount(
        swapAmount,
        direction === 'tokenToEth' ? tokenDecimals : 18,
      ),
    [direction, swapAmount, tokenDecimals],
  )

  /**
   * quoteTokenForEth / quoteEthForToken 仍是只读 RPC。报价来自当前储备，页面不复制 Solidity 的 x*y=k 公式。
   * 储备变化后 Wagmi 会重新读取；提交时的 minAmountOut 才是合约真正强制执行的保护条件。
   */
  const tokenToEthQuote = useReadContract({
    abi: learningSwapAbi,
    address: swapAddress,
    args: [swapAmountIn ?? 0n],
    chainId: sepolia.id,
    functionName: 'quoteTokenForEth',
    query: {
      enabled: Boolean(
        poolActive && direction === 'tokenToEth' && swapAmountIn,
      ),
    },
  })
  const ethToTokenQuote = useReadContract({
    abi: learningSwapAbi,
    address: swapAddress,
    args: [swapAmountIn ?? 0n],
    chainId: sepolia.id,
    functionName: 'quoteEthForToken',
    query: {
      enabled: Boolean(
        poolActive && direction === 'ethToToken' && swapAmountIn,
      ),
    },
  })
  const quote =
    direction === 'tokenToEth' ? tokenToEthQuote.data : ethToTokenQuote.data
  const quoteError =
    direction === 'tokenToEth' ? tokenToEthQuote.error : ethToTokenQuote.error

  const slippageBps = useMemo(() => {
    try {
      return parseSlippageBps(slippage)
    } catch {
      return undefined
    }
  }, [slippage])
  const minimumOutput = useMemo(
    () =>
      quote !== undefined && slippageBps !== undefined
        ? minimumAmountOut(quote, slippageBps)
        : undefined,
    [quote, slippageBps],
  )
  const hasSwapAllowance = Boolean(
    swapAmountIn &&
    allowance.data !== undefined &&
    allowance.data >= swapAmountIn,
  )

  const swapGas = useQuery({
    queryKey: [
      'learning-swap-gas',
      swapAddress,
      connection.address,
      direction,
      swapAmountIn?.toString(),
      minimumOutput?.toString(),
      hasSwapAllowance,
    ],
    queryFn: async () => {
      if (
        !publicClient ||
        !connection.address ||
        !swapAddress ||
        !swapAmountIn ||
        !minimumOutput
      ) {
        throw new Error('Gas 估算参数尚未准备完成。')
      }
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 10 * 60)
      const gasLimit =
        direction === 'tokenToEth'
          ? await publicClient.estimateContractGas({
              abi: learningSwapAbi,
              account: connection.address,
              address: swapAddress,
              args: [swapAmountIn, minimumOutput, deadline],
              functionName: 'swapTokenForEth',
            })
          : await publicClient.estimateContractGas({
              abi: learningSwapAbi,
              account: connection.address,
              address: swapAddress,
              args: [minimumOutput, deadline],
              functionName: 'swapEthForToken',
              value: swapAmountIn,
            })
      const { maxFeePerGas } = await publicClient.estimateFeesPerGas()
      return {
        gasLimit,
        maxFeePerGas,
        totalCost: maximumTransactionCost(
          direction === 'ethToToken' ? swapAmountIn : 0n,
          gasLimit,
          maxFeePerGas,
        ),
      }
    },
    enabled: Boolean(
      canTransact &&
      poolActive &&
      swapAmountIn &&
      minimumOutput &&
      (direction === 'ethToToken' || hasSwapAllowance),
    ),
    staleTime: 15_000,
    retry: false,
  })

  // getReserves 返回 tuple；读取完成前用 0n 占位只用于展示，poolActive=false 会阻止按零储备交易。
  const [tokenReserve = 0n, ethReserve = 0n] = reserves.data ?? []
  const spotPrice = useMemo(() => {
    const readableToken = Number(formatUnits(tokenReserve, tokenDecimals))
    const readableEth = Number(formatEther(ethReserve))
    if (!readableToken || !Number.isFinite(readableToken + readableEth)) {
      return '等待有效储备'
    }
    return `1 ${tokenSymbol} ≈ ${(readableEth / readableToken).toPrecision(6)} ETH`
  }, [ethReserve, tokenDecimals, tokenReserve, tokenSymbol])

  // 理想输出按交易前储备比例计算；它与实际恒定乘积报价的差距用于教学展示“含手续费的价格影响”。
  const priceImpact = useMemo(() => {
    if (!swapAmountIn || !quote || tokenReserve === 0n || ethReserve === 0n) {
      return undefined
    }
    const idealOutput =
      direction === 'tokenToEth'
        ? (swapAmountIn * ethReserve) / tokenReserve
        : (swapAmountIn * tokenReserve) / ethReserve
    if (idealOutput === 0n || quote >= idealOutput) return 0
    return Number(((idealOutput - quote) * 10_000n) / idealOutput) / 100
  }, [direction, ethReserve, quote, swapAmountIn, tokenReserve])
  const feeAmount = swapAmountIn ? (swapAmountIn * 30n) / 10_000n : undefined

  // 一条共享生命周期足够描述当前钱包请求；新操作会清空旧 Hash，避免把上一笔回执误当成当前结果。
  const [action, setAction] = useState<SwapAction>()
  const [hash, setHash] = useState<Hash>()
  const [actionError, setActionError] = useState('')
  const [closeAcknowledged, setCloseAcknowledged] = useState(false)
  const receipt = useWaitForTransactionReceipt({
    chainId: sepolia.id,
    confirmations: 2,
    hash,
    timeout: 120_000,
  })
  const busy = writeContract.isPending || (receipt.isPending && Boolean(hash))
  const recentSwaps = useQuery({
    queryKey: [
      'learning-swap-events',
      swapAddress,
      receipt.data?.blockNumber.toString(),
    ],
    queryFn: async () => {
      if (!publicClient || !swapAddress) {
        throw new Error('教学兑换事件客户端尚未准备完成。')
      }
      const latestBlock = await publicClient.getBlockNumber()
      const fromBlock = latestBlock > 2_000n ? latestBlock - 2_000n : 0n
      const events = await publicClient.getContractEvents({
        abi: learningSwapAbi,
        address: swapAddress,
        eventName: 'Swap',
        fromBlock,
        toBlock: 'latest',
      })
      return events.slice(-10).reverse()
    },
    enabled: Boolean(
      publicClient &&
      configurationReady &&
      initialized.data === true &&
      swapAddress,
    ),
    staleTime: 30_000,
    retry: 1,
  })

  useEffect(() => {
    if (!receipt.isSuccess) return
    // 所有相关数据都是 Wagmi/TanStack 读取；确认后统一标记过期，让余额、allowance、储备和状态回到链上真值。
    void queryClient.invalidateQueries()
  }, [queryClient, receipt.isSuccess])

  const transactionEvent = useMemo(() => {
    if (!receipt.data || receipt.data.status !== 'success' || !action) return ''

    if (action === 'approve-initialization' || action === 'approve-swap') {
      const approval = parseEventLogs({
        abi: erc20Abi,
        logs: receipt.data.logs,
        strict: false,
      })
        .filter((event) => event.eventName === 'Approval')
        .at(-1)
      return approval?.args.owner && approval.args.value !== undefined
        ? `Approval：${approval.args.owner} 允许资金池最多代扣 ${formatUnits(approval.args.value, tokenDecimals)} ${tokenSymbol}。代币尚未移动。`
        : ''
    }

    const event = parseEventLogs({
      abi: learningSwapAbi,
      logs: receipt.data.logs,
      strict: false,
    }).at(-1)
    if (
      event?.eventName === 'Initialized' &&
      event.args.tokenAmount !== undefined &&
      event.args.ethAmount !== undefined
    ) {
      return `Initialized：资金池收到 ${formatUnits(event.args.tokenAmount, tokenDecimals)} ${tokenSymbol} 和 ${formatEther(event.args.ethAmount)} ETH。`
    }
    if (
      event?.eventName === 'Swap' &&
      event.args.tokenToEth !== undefined &&
      event.args.amountIn !== undefined &&
      event.args.amountOut !== undefined
    ) {
      return event.args.tokenToEth
        ? `Swap：投入 ${formatUnits(event.args.amountIn, tokenDecimals)} ${tokenSymbol}，收到 ${formatEther(event.args.amountOut)} ETH。`
        : `Swap：投入 ${formatEther(event.args.amountIn)} ETH，收到 ${formatUnits(event.args.amountOut, tokenDecimals)} ${tokenSymbol}。`
    }
    if (
      event?.eventName === 'Closed' &&
      event.args.tokenAmount !== undefined &&
      event.args.ethAmount !== undefined
    ) {
      return `Closed：owner 取回 ${formatUnits(event.args.tokenAmount, tokenDecimals)} ${tokenSymbol} 和 ${formatEther(event.args.ethAmount)} ETH；资金池永久停用。`
    }
    return ''
  }, [action, receipt.data, tokenDecimals, tokenSymbol])

  // 每次新操作都清掉上一笔错误和 Hash，避免旧回执/事件被误认为当前交易结果。
  function begin(nextAction: SwapAction) {
    setAction(nextAction)
    setActionError('')
    setHash(undefined)
  }

  /** 按钮的 disabled 只是体验优化；这里再次检查所有信任边界，防止状态切换瞬间绕过 UI。 */
  function requireTransactionContext() {
    if (!canTransact) throw new Error('请连接钱包并切换到 Sepolia。')
    if (!publicClient || !connection.address || !swapAddress) {
      throw new Error('教学兑换客户端尚未准备完成。')
    }
    if (!hasContractCode) throw new Error('教学兑换地址上没有合约字节码。')
    if (!tokenMatches) throw new Error('教学兑换合约绑定的代币与页面不一致。')
    return {
      account: connection.address,
      client: publicClient,
      pool: swapAddress,
    }
  }

  /**
   * 精确授权只把本次需要的 token 数量写入 allowance，不会移动代币。
   * 初始化和 token→ETH 共用它，但通过 action 分开显示按钮阶段与 Approval 说明。
   */
  async function approveTokens(
    amount: bigint | undefined,
    approvalAction: 'approve-initialization' | 'approve-swap',
  ) {
    begin(approvalAction)
    try {
      const context = requireTransactionContext()
      if (!amount) throw new Error('请输入大于零的代币数量。')
      if (walletTokenBalance !== undefined && amount > walletTokenBalance) {
        throw new Error(`${tokenSymbol} 余额不足。`)
      }
      const { request } = await context.client.simulateContract({
        abi: erc20Abi,
        account: context.account,
        address: tokenAddress,
        args: [context.pool, amount],
        functionName: 'approve',
      })
      setHash(await writeContract.mutateAsync(request))
    } catch (error) {
      setActionError(getErrorMessage(error))
    }
  }

  /** owner 的第二笔交易：合约通过 transferFrom 收 SLT，并通过 payable msg.value 同时收 ETH。 */
  async function initializePool() {
    begin('initialize')
    try {
      const context = requireTransactionContext()
      if (!isOwner) throw new Error('只有资金池 owner 可以初始化。')
      if (initialized.data !== false || closed.data) {
        throw new Error('资金池不能再次初始化。')
      }
      if (!initialTokenAmount || !initialEthAmount) {
        throw new Error('初始 SLT 和 ETH 数量都必须大于零。')
      }
      if (allowance.data === undefined || allowance.data < initialTokenAmount) {
        throw new Error('请先完成初始 SLT 精确授权。')
      }
      if (
        walletTokenBalance !== undefined &&
        initialTokenAmount > walletTokenBalance
      ) {
        throw new Error(`${tokenSymbol} 余额不足。`)
      }
      if (ethBalance.data && initialEthAmount >= ethBalance.data.value) {
        throw new Error('Sepolia ETH 不足，还需要预留部署后的交易 Gas。')
      }
      const { request } = await context.client.simulateContract({
        abi: learningSwapAbi,
        account: context.account,
        address: context.pool,
        args: [initialTokenAmount],
        functionName: 'initialize',
        value: initialEthAmount,
      })
      setHash(await writeContract.mutateAsync(request))
    } catch (error) {
      setActionError(getErrorMessage(error))
    }
  }

  /** token→ETH：检查余额/allowance，使用当前报价生成最低到账，再模拟并请求钱包签名。 */
  async function swapTokenForEth() {
    begin('swap-token')
    try {
      const context = requireTransactionContext()
      if (!poolActive) throw new Error('资金池尚未进入可兑换状态。')
      if (!swapAmountIn || !minimumOutput) {
        throw new Error('请输入有效数量并等待报价。')
      }
      if (
        walletTokenBalance !== undefined &&
        swapAmountIn > walletTokenBalance
      ) {
        throw new Error(`${tokenSymbol} 余额不足。`)
      }
      if (allowance.data === undefined || allowance.data < swapAmountIn) {
        throw new Error('请先完成本次兑换的精确授权。')
      }
      if (!swapGas.data) throw new Error('请等待 Gas 预算完成。')
      if (ethBalance.data && swapGas.data.totalCost > ethBalance.data.value) {
        throw new Error('Sepolia ETH 不足以支付本次兑换 Gas。')
      }
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 10 * 60)
      const { request } = await context.client.simulateContract({
        abi: learningSwapAbi,
        account: context.account,
        address: context.pool,
        args: [swapAmountIn, minimumOutput, deadline],
        functionName: 'swapTokenForEth',
      })
      setHash(await writeContract.mutateAsync(request))
    } catch (error) {
      setActionError(getErrorMessage(error))
    }
  }

  /** ETH→token：原生 ETH 随 value 进入合约，所以没有 ERC-20 approve 步骤，但必须预留 Gas。 */
  async function swapEthForToken() {
    begin('swap-eth')
    try {
      const context = requireTransactionContext()
      if (!poolActive) throw new Error('资金池尚未进入可兑换状态。')
      if (!swapAmountIn || !minimumOutput) {
        throw new Error('请输入有效数量并等待报价。')
      }
      if (ethBalance.data && swapAmountIn >= ethBalance.data.value) {
        throw new Error('Sepolia ETH 不足，还需要为兑换预留 Gas。')
      }
      if (!swapGas.data) throw new Error('请等待 Gas 预算完成。')
      if (ethBalance.data && swapGas.data.totalCost > ethBalance.data.value) {
        throw new Error('Sepolia ETH 不足以覆盖兑换金额和最大 Gas 成本。')
      }
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 10 * 60)
      const { request } = await context.client.simulateContract({
        abi: learningSwapAbi,
        account: context.account,
        address: context.pool,
        args: [minimumOutput, deadline],
        functionName: 'swapEthForToken',
        value: swapAmountIn,
      })
      setHash(await writeContract.mutateAsync(request))
    } catch (error) {
      setActionError(getErrorMessage(error))
    }
  }

  /** close 只有 owner 可调用；确认框是不可逆操作的 UI 防误触，合约 onlyOwner 才是链上权限边界。 */
  async function closePool() {
    begin('close')
    try {
      const context = requireTransactionContext()
      if (!isOwner || !poolActive) {
        throw new Error('只有 owner 能关闭运行中的资金池。')
      }
      if (!closeAcknowledged) throw new Error('请先确认永久关闭风险。')
      const { request } = await context.client.simulateContract({
        abi: learningSwapAbi,
        account: context.account,
        address: context.pool,
        functionName: 'close',
      })
      setHash(await writeContract.mutateAsync(request))
    } catch (error) {
      setActionError(getErrorMessage(error))
    }
  }

  const poolReadError =
    owner.error ||
    poolToken.error ||
    initialized.error ||
    closed.error ||
    reserves.error
  const hasInitialAllowance = Boolean(
    initialTokenAmount &&
    allowance.data !== undefined &&
    allowance.data >= initialTokenAmount,
  )
  // 这些派生值只控制单位和文案；真正传入合约的金额始终是上面的 bigint 最小单位。
  const outputDecimals = direction === 'tokenToEth' ? 18 : tokenDecimals
  const outputSymbol = direction === 'tokenToEth' ? 'ETH' : tokenSymbol
  const inputDecimals = direction === 'tokenToEth' ? tokenDecimals : 18
  const inputSymbol = direction === 'tokenToEth' ? tokenSymbol : 'ETH'

  return (
    <div className="learning-swap">
      <h3>后续完整流程：SLT ↔ Sepolia ETH 教学兑换</h3>
      <p className="muted">
        前面的余额、授权和转账是 ERC-20 基础；这里把它们串成真实 DeFi
        流程：建立资金池、读取报价、设置成交保护、授权、模拟、签名、等待回执并刷新储备。
      </p>
      <aside className="warning" role="note">
        仅限 Sepolia 测试资金。这个教学池没有 LP 份额，owner
        可以永久关闭并取回全部储备，属于明确的中心化教学简化。
      </aside>

      {!rawSwapAddress && (
        <p className="muted">
          尚未配置教学兑换。先部署 <code>LearningSwap.sol</code>，再设置{' '}
          <code>NEXT_PUBLIC_LEARNING_SWAP_ADDRESS</code> 并重启开发服务。
        </p>
      )}
      {rawSwapAddress && !swapAddress && (
        <p className="error">
          NEXT_PUBLIC_LEARNING_SWAP_ADDRESS 不是有效的 0x 合约地址。
        </p>
      )}
      {swapAddress && contractCode.isPending && (
        <p className="muted">正在通过 Sepolia RPC 检查合约字节码…</p>
      )}
      {contractCode.error && (
        <p className="error">
          合约代码检查失败：{getErrorMessage(contractCode.error)}
        </p>
      )}
      {swapAddress && contractCode.data === '0x' && (
        <p className="error">
          该 Sepolia 地址没有合约字节码，请检查部署网络和地址。
        </p>
      )}
      {poolReadError && (
        <p className="error">
          教学兑换读取失败：{getErrorMessage(poolReadError)}
        </p>
      )}
      {hasContractCode && poolToken.data && !tokenMatches && (
        <p className="error">
          合约绑定的 token 是 <span className="mono">{poolToken.data}</span>
          ，与本页配置的 <span className="mono">{tokenAddress}</span> 不一致。
        </p>
      )}

      {swapAddress && (
        <dl className="facts">
          <div>
            <dt>兑换合约</dt>
            <dd className="mono">{swapAddress}</dd>
          </div>
          <div>
            <dt>owner</dt>
            <dd className="mono">{owner.data ?? '读取中…'}</dd>
          </div>
          <div>
            <dt>合约绑定代币</dt>
            <dd className="mono">{poolToken.data ?? '读取中…'}</dd>
          </div>
          <div>
            <dt>资金池状态</dt>
            <dd>
              {closed.data
                ? '已永久关闭'
                : initialized.data
                  ? '运行中'
                  : initialized.data === false
                    ? '等待初始化'
                    : '读取中…'}
            </dd>
          </div>
        </dl>
      )}

      {configurationReady &&
        initialized.data === false &&
        closed.data === false &&
        (isOwner ? (
          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault()
              void initializePool()
            }}
          >
            <h3>owner：一次性初始化资金池</h3>
            <p className="muted">
              目的：把第一批 {tokenSymbol} 和 Sepolia ETH
              存入合约。两者比例形成初始价格；初始化只能成功一次。
            </p>
            <div className="two-column">
              <label>
                初始 {tokenSymbol} 数量
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={initialToken}
                  onChange={(event) => setInitialToken(event.target.value)}
                  required
                />
              </label>
              <label>
                初始 Sepolia ETH 数量
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={initialEth}
                  onChange={(event) => setInitialEth(event.target.value)}
                  required
                />
              </label>
            </div>
            {!hasInitialAllowance ? (
              <button
                type="button"
                disabled={!canTransact || !initialTokenAmount || busy}
                onClick={() =>
                  void approveTokens(
                    initialTokenAmount,
                    'approve-initialization',
                  )
                }
              >
                {writeContract.isPending && action === 'approve-initialization'
                  ? '请检查钱包…'
                  : `第 1 步：模拟并授权 ${tokenSymbol}`}
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canTransact || !initialEthAmount || busy}
              >
                {writeContract.isPending && action === 'initialize'
                  ? '请检查钱包…'
                  : '第 2 步：模拟并注入两种储备'}
              </button>
            )}
            <p className="muted">
              第一步 approve 只设置代扣上限，不移动代币；第二步 initialize
              才由合约执行 transferFrom 收取代币，并同时接收交易附带的 ETH。
            </p>
          </form>
        ) : (
          <p className="muted">
            资金池尚未初始化。只有 owner{' '}
            <span className="mono">{owner.data}</span>
            能先授权初始 {tokenSymbol}，再注入 {tokenSymbol} 和
            ETH；其他账户不能决定初始价格。
          </p>
        ))}

      {configurationReady && closed.data === true && (
        <p className="error">
          资金池已永久关闭。owner
          已按关闭交易取回当时的全部储备，合约不会重新开放初始化或兑换。
        </p>
      )}

      {poolActive && (
        <>
          <dl className="facts">
            <div>
              <dt>{tokenSymbol} 储备</dt>
              <dd>
                {formatUnits(tokenReserve, tokenDecimals)} {tokenSymbol}
              </dd>
            </div>
            <div>
              <dt>ETH 储备</dt>
              <dd>{formatEther(ethReserve)} ETH</dd>
            </div>
            <div>
              <dt>储备隐含价格</dt>
              <dd>{spotPrice}</dd>
            </div>
            <div>
              <dt>当前钱包代币</dt>
              <dd>
                {walletTokenBalance === undefined
                  ? connection.address
                    ? '读取中…'
                    : '请连接钱包'
                  : `${formatUnits(walletTokenBalance, tokenDecimals)} ${tokenSymbol}`}
              </dd>
            </div>
          </dl>

          <div className="two-column">
            <form
              onSubmit={(event: FormEvent) => {
                event.preventDefault()
                if (direction === 'tokenToEth') void swapTokenForEth()
                else void swapEthForToken()
              }}
            >
              <h3>执行双向兑换</h3>
              <label>
                兑换方向
                <select
                  value={direction}
                  onChange={(event) => {
                    setDirection(event.target.value as SwapDirection)
                    setSwapAmount(
                      event.target.value === 'tokenToEth' ? '1' : '0.001',
                    )
                  }}
                >
                  <option value="tokenToEth">{tokenSymbol} → ETH</option>
                  <option value="ethToToken">ETH → {tokenSymbol}</option>
                </select>
              </label>
              <label>
                输入数量（{inputSymbol}）
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={swapAmount}
                  onChange={(event) => setSwapAmount(event.target.value)}
                  required
                />
              </label>
              <label>
                最大滑点（%）
                <input
                  type="number"
                  min="0"
                  max="5"
                  step="0.1"
                  value={slippage}
                  onChange={(event) => setSlippage(event.target.value)}
                  required
                />
              </label>
              <dl className="facts">
                <div>
                  <dt>预计获得</dt>
                  <dd>
                    {quote === undefined
                      ? swapAmountIn
                        ? '读取合约报价中…'
                        : '请输入有效数量'
                      : `${formatUnits(quote, outputDecimals)} ${outputSymbol}`}
                  </dd>
                </div>
                <div>
                  <dt>输入侧手续费</dt>
                  <dd>
                    {feeAmount === undefined
                      ? '—'
                      : `约 ${formatUnits(feeAmount, inputDecimals)} ${inputSymbol}（0.3%，留在池中）`}
                  </dd>
                </div>
                <div>
                  <dt>含费价格影响</dt>
                  <dd>
                    {priceImpact === undefined
                      ? '—'
                      : `${priceImpact.toFixed(2)}%`}
                  </dd>
                </div>
                <div>
                  <dt>最低到账</dt>
                  <dd>
                    {minimumOutput === undefined
                      ? '等待有效报价与滑点'
                      : `${formatUnits(minimumOutput, outputDecimals)} ${outputSymbol}`}
                  </dd>
                </div>
                <div>
                  <dt>截止时间</dt>
                  <dd>点击兑换后 10 分钟</dd>
                </div>
                <div>
                  <dt>Gas / 钱包最大支出</dt>
                  <dd>
                    {swapGas.data
                      ? `${swapGas.data.gasLimit} Gas · ≤ ${formatEther(swapGas.data.totalCost)} ETH`
                      : swapGas.isPending
                        ? '正在按当前报价估算…'
                        : direction === 'tokenToEth' && !hasSwapAllowance
                          ? `授权后估算 ${tokenSymbol}→ETH Gas`
                          : '等待有效交易参数'}
                  </dd>
                </div>
              </dl>
              {direction === 'tokenToEth' && !hasSwapAllowance ? (
                <button
                  type="button"
                  disabled={!canTransact || !swapAmountIn || busy}
                  onClick={() =>
                    void approveTokens(swapAmountIn, 'approve-swap')
                  }
                >
                  {writeContract.isPending && action === 'approve-swap'
                    ? '请检查钱包…'
                    : `第 1 步：精确授权 ${tokenSymbol}`}
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={
                    !canTransact ||
                    !swapAmountIn ||
                    !minimumOutput ||
                    slippageBps === undefined ||
                    !swapGas.data ||
                    busy
                  }
                >
                  {writeContract.isPending &&
                  (action === 'swap-token' || action === 'swap-eth')
                    ? '请检查钱包…'
                    : direction === 'tokenToEth'
                      ? '第 2 步：模拟并兑换'
                      : '模拟并兑换'}
                </button>
              )}
              {quoteError && (
                <p className="error">报价失败：{getErrorMessage(quoteError)}</p>
              )}
              {slippageBps === undefined && (
                <p className="error">滑点必须在 0% 到 5% 之间。</p>
              )}
              {swapGas.error && (
                <p className="error">
                  Gas 估算失败：{getErrorMessage(swapGas.error)}
                </p>
              )}
            </form>

            {isOwner ? (
              <form
                onSubmit={(event: FormEvent) => {
                  event.preventDefault()
                  void closePool()
                }}
              >
                <h3>owner：永久关闭</h3>
                <p className="muted">
                  关闭会先把 closed 写为 true，再把全部 {tokenSymbol} 和 ETH
                  储备退给 owner。该操作不能撤销。
                </p>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={closeAcknowledged}
                    onChange={(event) =>
                      setCloseAcknowledged(event.target.checked)
                    }
                  />
                  我确认这是测试网，并理解关闭后不能重新兑换。
                </label>
                <button
                  type="submit"
                  disabled={!canTransact || !closeAcknowledged || busy}
                >
                  {writeContract.isPending && action === 'close'
                    ? '请检查钱包…'
                    : '模拟并永久关闭'}
                </button>
              </form>
            ) : (
              <div className="teaching-card">
                <h3>谁能操作什么？</h3>
                <p className="muted">
                  所有人都能读取和兑换；只有 owner
                  能初始化或关闭。普通兑换不需要管理员批准，规则由合约代码统一执行。
                </p>
              </div>
            )}
          </div>
          <div className="teaching-card">
            <div className="section-heading">
              <h3>最近链上兑换 · 最近 2,000 个区块</h3>
              <button
                className="secondary"
                disabled={recentSwaps.isFetching}
                onClick={() => void recentSwaps.refetch()}
                type="button"
              >
                {recentSwaps.isFetching ? '刷新中…' : '刷新事件'}
              </button>
            </div>
            {recentSwaps.data?.length ? (
              <ol className="ticker-list" reversed>
                {recentSwaps.data.map((event) => (
                  <li key={`${event.transactionHash}-${event.logIndex}`}>
                    <span>
                      区块 {event.blockNumber} ·{' '}
                      {event.args.tokenToEth
                        ? `${tokenSymbol} → ETH`
                        : `ETH → ${tokenSymbol}`}
                    </span>
                    <strong>
                      {event.args.amountOut === undefined
                        ? '—'
                        : event.args.tokenToEth
                          ? `${formatEther(event.args.amountOut)} ETH`
                          : `${formatUnits(event.args.amountOut, tokenDecimals)} ${tokenSymbol}`}
                    </strong>
                  </li>
                ))}
              </ol>
            ) : recentSwaps.error ? (
              <p className="error">
                事件读取失败：{getErrorMessage(recentSwaps.error)}
              </p>
            ) : (
              <p className="muted">
                {recentSwaps.isFetching
                  ? '正在扫描事件…'
                  : '最近区块没有兑换事件。'}
              </p>
            )}
          </div>
        </>
      )}

      {(hash || actionError || writeContract.isPending) && (
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
      )}
      {transactionEvent && (
        <output className="result mono">{transactionEvent}</output>
      )}

      <LearningSwapGuide tokenSymbol={tokenSymbol} />
    </div>
  )
}
