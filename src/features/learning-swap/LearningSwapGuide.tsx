/**
 * 纯教学说明组件：只接收页面要显示的代币符号，不读取 RPC，也不持有表单或交易状态。
 * 把它与链上编排分开后，初学者可以分别阅读“页面怎样执行交易”和“交易为什么这样工作”。
 */
export function LearningSwapGuide({ tokenSymbol }: { tokenSymbol: string }) {
  return (
    <>
      <details>
        <summary>完整执行过程：RPC、钱包和合约分别做什么</summary>
        <ol className="muted">
          <li>
            页面先通过 Sepolia RPC 执行 <code>eth_call</code>
            ，读取 owner、储备、余额、allowance
            和报价。这些调用不改变链上状态，不消耗 Gas，也不需要签名。
          </li>
          <li>
            需要写链时，页面先用当前账户执行 <code>simulateContract</code>
            。RPC 在当前 EVM
            状态中预演，但不保存结果；余额、授权或保护条件不满足时会在弹钱包前失败。
          </li>
          <li>
            模拟通过后，请求才交给钱包。钱包展示网络、目标合约、金额和
            Gas；私钥只在钱包内签名，页面拿不到私钥。
          </li>
          <li>
            钱包把签名交易广播给
            Sepolia。交易哈希只代表已提交；验证者执行后产生的 receipt
            才说明成功或回滚。
          </li>
          <li>
            成功回执中的 logs 会按 ABI 解码为 Approval、Initialized、Swap 或
            Closed；随后页面重新读取链上余额和储备。
          </li>
        </ol>
      </details>

      <details>
        <summary>底层原理：x×y=k、手续费、价格影响与滑点</summary>
        <p className="muted">
          资金池把 {tokenSymbol} 储备记作 x、ETH 储备记作
          y，并让兑换后的储备接近 <code>x × y = k</code>
          。输入越大，输出资产被取走越多，后续每一单位输入换到的资产就越少，因此大额交易会产生更明显的价格影响。
        </p>
        <p className="muted">
          合约只让输入的 99.7% 参与报价，剩余 0.3%
          留在池中。页面报价只是某一时刻的快照；真正交易使用最低到账保护。如果执行时输出低于
          <code>minAmountOut = quote × (1 - slippage)</code>
          ，或已经超过提交时生成的 10 分钟 deadline，合约会回滚全部资产变化。
        </p>
      </details>

      <details>
        <summary>为什么一个方向要授权，另一个方向不用</summary>
        <p className="muted">
          {tokenSymbol} 是 ERC-20
          合约账本中的余额。资金池不能直接动用户账本，所以 {tokenSymbol}→ETH
          必须先 approve，再由资金池调用 transferFrom；approve
          只设置上限，不会立即转币。ETH 是 EVM 原生资产，ETH→{tokenSymbol}
          时通过交易的 msg.value 直接附带，因此不需要 ERC-20
          授权，但交易仍需钱包签名并支付 Gas。
        </p>
      </details>

      <details>
        <summary>失败时会发生什么，以及本教学池不能做什么</summary>
        <p className="muted">
          EVM
          交易具有原子性：授权不足、余额不足、价格变化超过滑点、交易过期或转账失败时，兑换中的资产变化会整体回滚，但已经用于执行失败交易的
          Gas 不会退回。用户在钱包中拒绝时交易没有广播，不消耗 Gas。
        </p>
        <p className="muted">
          本池只支持项目内标准 ERC-20，不支持转账税、通缩或 rebasing 代币；没有
          LP 份额、任意用户加减流动性、路由、预言机、MEV 防护或正式审计。它用于
          Sepolia 学习，不能承载真实资产。
        </p>
      </details>
    </>
  )
}
