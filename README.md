# Web3 钱包与行情实验室

这是一个面向高级前端工程师面试准备的可运行演示，使用 Next.js App
Router、TypeScript、Wagmi/Viem、Solana Kit、Sui dApp Kit 和 TradingView
Advanced Charts。页面按 **EVM Sepolia / Solana Devnet / Sui Devnet / 行情**
四个 Tab 分区，避免不同链的钱包状态和阅读流程混在一起。

> 只使用测试账户和测试币。不要在本项目、`.env.local`、Remix、终端历史或聊天中输入私钥、助记词或主网资金。

## 1. 从零开始运行

### 第 1 步：进入项目目录

```bash
cd evm-sepolia-demo
```

### 第 2 步：检查 Node.js 和 npm

项目要求 Node.js 22.22.1 或更高版本。

```bash
node --version
npm --version
```

### 第 3 步：安装依赖

项目使用 `package-lock.json`，因此使用 npm。

```bash
npm install
```

### 第 4 步：创建本地环境文件

```bash
cp .env.example .env.local
```

所有配置都是可选的。即使 `.env.local` 中的可选值为空，应用仍可启动，并显示如何启用对应功能。

### 第 5 步：启动开发服务器

```bash
npm run dev
```

### 第 6 步：打开页面

在浏览器访问：

```text
http://localhost:3000
```

首次打开时，即使没有安装钱包，也应看到四个顶部 Tab。只有进入某个 Tab
才挂载该链或行情模块；离开行情 Tab 会销毁图表、Worker、WebSocket、定时器和监听器。

### 第 7 步：停止开发服务器

回到运行 `npm run dev` 的终端，按 `Ctrl+C`。

## 2. 环境变量逐项配置

`.env.local` 可包含以下内容：

```dotenv
NEXT_PUBLIC_SEPOLIA_RPC_URL=
NEXT_PUBLIC_SEPOLIA_RPC_FALLBACK_URL=
NEXT_PUBLIC_REOWN_PROJECT_ID=
NEXT_PUBLIC_COUNTER_ADDRESS=
NEXT_PUBLIC_ERC20_ADDRESS=
NEXT_PUBLIC_ERC20_SPENDER_ADDRESS=
NEXT_PUBLIC_LEARNING_SWAP_ADDRESS=
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_SOLANA_TOKEN_MINT=
NEXT_PUBLIC_SOLANA_TOKEN_SYMBOL=TOKEN
NEXT_PUBLIC_SUI_RPC_URL=https://fullnode.devnet.sui.io:443
NEXT_PUBLIC_SUI_COUNTER_PACKAGE_ID=
NEXT_PUBLIC_SUI_COUNTER_OBJECT_ID=
NEXT_PUBLIC_MARKET_MODE=live
```

每一项的用途：

1. `NEXT_PUBLIC_SEPOLIA_RPC_URL`：首选 Sepolia 公共 RPC；留空时使用 Wagmi 默认公共 RPC。
2. `NEXT_PUBLIC_SEPOLIA_RPC_FALLBACK_URL`：可选第二 RPC。设置后 Viem 会对两个自定义 RPC 和默认公共 RPC 做故障切换。
3. `NEXT_PUBLIC_REOWN_PROJECT_ID`：可选 Reown 项目 ID。设置后出现 WalletConnect 二维码连接按钮。
4. `NEXT_PUBLIC_COUNTER_ADDRESS`：部署到 Sepolia 的 `Counter.sol` 地址。
5. `NEXT_PUBLIC_ERC20_ADDRESS`：Sepolia ERC-20 测试代币地址。
6. `NEXT_PUBLIC_ERC20_SPENDER_ADDRESS`：用于练习授权额度和代币授权的支出方地址。
7. `NEXT_PUBLIC_LEARNING_SWAP_ADDRESS`：部署在 Sepolia 的 `LearningSwap.sol` 教学兑换合约地址。
8. `NEXT_PUBLIC_SOLANA_RPC_URL`：Solana Devnet RPC，默认使用官方公共 Devnet 地址。
9. `NEXT_PUBLIC_SOLANA_TOKEN_MINT`：可选 Devnet SPL Token Mint，页面仍可手动修改。
10. `NEXT_PUBLIC_SOLANA_TOKEN_SYMBOL`：Mint 的展示符号；精度和余额始终从链上读取。
11. `NEXT_PUBLIC_SUI_RPC_URL`：Sui Devnet gRPC 地址，默认使用官方公共节点。
12. `NEXT_PUBLIC_SUI_COUNTER_PACKAGE_ID`：发布 Move 包后得到的 Package ID，也就是不可变代码地址。
13. `NEXT_PUBLIC_SUI_COUNTER_OBJECT_ID`：发布时 `init` 创建的共享 Counter Object ID，也就是可变链上状态。
14. `NEXT_PUBLIC_MARKET_MODE`：`live` 使用 OKX `ETH-USDT-SWAP` 公共行情；`mock` 使用确定性本地流。

修改 `.env.local` 后，停止并重新运行开发服务器：

```bash
npm run dev
```

`NEXT_PUBLIC_*` 会进入浏览器代码，只能放公开地址、公开 RPC 和公开客户端 ID，不能放任何秘密。

## 3. 推荐的完整练习顺序

建议依次完成：

1. 启动应用并确认无钱包时也能正常渲染。
2. 连接 EVM 浏览器扩展钱包。
3. 检查账户、网络和 Sepolia ETH 余额。
4. 从错误网络切换到 Sepolia。
5. 签名一条消息。
6. 发送极小额 Sepolia 测试 ETH。
7. 部署并配置 Counter，然后完成读取、模拟、写入和事件解析。
8. 配置 Sepolia ERC-20，然后完成余额、授权额度、精确授权、撤销授权和代币转账。
9. 部署并配置 LearningSwap，由 owner 初始化 SLT/ETH 储备。
10. 完成 SLT→ETH 和 ETH→SLT 的报价、滑点保护、模拟、签名、回执与事件流程。
11. 在 Solana Devnet Tab 完成 SOL 转账、SPL Token/ATA 读取与 TransferChecked。
12. 安装 Sui CLI，在 Devnet 构建、测试、发布共享 Counter，记录 Package ID 与 Counter Object ID。
13. 在 Sui Devnet Tab 完成连接、余额读取、SUI 转账和共享 Counter 递增。
14. 在行情 Tab 检查 14 个周期、向右拖动加载历史、Level2、逐笔、实时刷新、背压和降级指标。
15. 运行格式、Lint、类型、测试、构建和 pre-commit 检查。

## 4. 操作 01：连接 EVM 钱包

### 准备

1. 安装支持 EIP-1193 的浏览器扩展钱包，例如 MetaMask 或 Rabby。
2. 在钱包中创建专门的测试账户。
3. 不要导入有主网资产的账户。
4. 解锁钱包后刷新应用页面。

### 使用 injected 钱包连接

1. 找到 **01 连接 EVM 钱包并锁定网络**。
2. 点击 **连接浏览器扩展钱包**。
3. 在钱包弹窗中检查当前网站来源是 `localhost`。
4. 选择测试账户。
5. 点击钱包中的连接确认按钮。
6. 页面应显示：
   - `EVM 账户`：当前 EVM 地址。
   - `网络`：当前连接网络。
   - `Sepolia 余额`：该地址的 Sepolia ETH 余额。

如果未安装或未解锁钱包，页面会显示：

```text
未检测到浏览器扩展钱包，请安装或解锁钱包。
```

### 断开 EVM 钱包

1. 点击模块右上角的 **断开连接**。
2. 页面恢复为未连接状态。
3. 这只清除应用会话，不会删除钱包账户或资产。

## 5. 操作 01B：切换到 Sepolia

所有 EVM 签名和交易操作只允许在 Sepolia 上执行。

1. 先连接 EVM 钱包。
2. 如果钱包当前不是 Sepolia，页面会显示 wrong-chain 提示。
3. 签名、原生转账和合约写入按钮会被锁定。
4. 点击 **切换到 Sepolia**。
5. 在钱包弹窗中检查目标网络是 Sepolia，chain ID 是 `11155111`。
6. 批准切换。
7. 页面中的 `网络` 应变为 `Sepolia`，交易按钮恢复可用。

如果钱包拒绝切链，页面保留错误状态，不会自动重试。

## 6. 可选操作：使用 WalletConnect/Reown

默认 injected 流程不需要任何项目 ID。只有练习移动端或远程钱包时才配置 Reown。

### 配置

1. 在 Reown 控制台创建项目并取得公开 project ID。
2. 打开 `.env.local`。
3. 设置：

```dotenv
NEXT_PUBLIC_REOWN_PROJECT_ID=你的公开ProjectId
```

4. 重启开发服务器。

### 连接

1. 刷新页面。
2. 在模块 01 点击 WalletConnect 对应的连接按钮。
3. 二维码出现后，使用支持 WalletConnect 的测试钱包扫描。
4. 在移动钱包中确认网站、账户和网络。
5. 批准连接。
6. 页面应显示与 injected 钱包相同的账户、chain 和余额信息。
7. 点击 **断开连接** 可断开应用会话。

未设置项目 ID 时不会加载 WalletConnect，浏览器扩展钱包流程不受影响。

## 7. 操作 02：签名消息

消息签名是链下操作，不消耗 gas，但签名仍可能授予权限，因此必须检查原文。

1. 连接 EVM 钱包。
2. 确认网络是 Sepolia。
3. 找到 **02 签名消息**。
4. 阅读默认消息，或在 `Message` 文本框输入自己的测试文本。
5. 不要签署空消息、陌生登录挑战或你不理解的授权文本。
6. 点击 **签名消息**。
7. 钱包弹窗出现后，逐字检查消息内容。
8. 点击钱包中的签名确认按钮。
9. 页面应显示 `签名结果：0x...`。

如果点击拒绝，页面显示 `用户已在钱包中拒绝请求。`，不会自动再次弹窗。

## 8. 操作 03：发送 Sepolia 测试 ETH

这是链上真实测试网交易，会消耗 Sepolia 测试 ETH。

### 准备测试资金

1. 使用公开 Sepolia 测试币水龙头给测试账户领取少量测试 ETH。
2. 不要购买或发送主网 ETH。
3. 等钱包中 Sepolia 余额更新后刷新应用。

### 发起转账

1. 连接钱包并确认网络是 Sepolia。
2. 找到 **03 发送 Sepolia 测试 ETH**。
3. 在 `收款地址` 输入另一个测试账户的 `0x...` 地址。
4. 在 `金额（Sepolia ETH）` 输入极小金额，例如：

```text
0.00001
```

5. 点击 **发送测试 ETH**。
6. 钱包弹窗出现后检查：
   - 网络是 Sepolia。
   - 收款地址完全一致。
   - 金额是预期的测试金额。
   - gas 费用合理。
7. 批准交易。
8. 页面会依次显示交易生命周期：
   - `等待钱包确认`：等待用户确认。
   - `已提交`：已取得交易哈希。
   - `确认中`：等待链上回执。
   - `已确认`：链上回执成功。
   - `失败`：钱包、RPC 或链上执行失败。
9. 点击 hash 可打开 Sepolia 区块浏览器。
10. 确认页面显示链上回执的区块、Gas 使用量和状态。
11. TanStack Query 会在确认后刷新相关 Wagmi 查询和余额。

常见错误：

1. 地址不是有效 `0x` 地址：前端拒绝提交。
2. 金额小于等于零：前端拒绝提交。
3. 余额不足：显示 Sepolia ETH 不足。
4. 用户拒绝：显示钱包拒绝提示。
5. RPC 失败：保留错误信息，不自动重试写交易。

## 9. 操作 04：部署 Counter 合约

项目提供 `contracts/Counter.sol`，不需要安装本地 Solidity 工具链。

### 查看合约源码

```bash
cat contracts/Counter.sol
```

### 使用 Remix 部署到 Sepolia

1. 打开 [Remix](https://remix.ethereum.org/)。
2. 在 Remix 新建文件 `Counter.sol`。
3. 从本项目复制 `contracts/Counter.sol` 的全部内容。
4. 打开 **Solidity 编译器**（英文界面名称为 `Solidity Compiler`）。
5. 选择兼容的 Solidity `0.8.x` 编译器。
6. 点击 **编译 Counter.sol**（英文按钮为 `Compile Counter.sol`）。
7. 打开 **部署并运行交易**（英文面板为 `Deploy & Run Transactions`）。
8. 在 `环境` 中选择 **浏览器扩展提供方**（英文选项为 `Injected Provider`）。
9. 在钱包中确认当前网络是 Sepolia。
10. 在合约下拉框选择 `Counter`。
11. 点击 **Deploy**。
12. 在钱包中检查这是 Sepolia 部署交易，并只使用测试 ETH。
13. 批准交易并等待 Remix 显示已部署合约。
14. 复制部署后的合约地址。

### 将地址配置到应用

1. 打开 `.env.local`。
2. 设置：

```dotenv
NEXT_PUBLIC_COUNTER_ADDRESS=0x你的SepoliaCounter地址
```

3. 重启 `npm run dev`。
4. 刷新页面。

地址为空或无效时，Counter 模块会显示配置说明，其他功能继续工作。

## 10. 操作 04B：读取、模拟并写入 Counter

1. 连接 EVM 钱包并切换到 Sepolia。
2. 找到 **04 读取、模拟并写入 Counter 合约**。
3. 检查 `合约地址` 是否等于你部署的地址。
4. 查看 `当前数值`，这是通过 RPC 调用只读的 `number()`。
5. 点击 **刷新读取结果** 可手动重新读取。
6. 等待 `交易预检` 变为 `已通过`。
7. `已通过` 表示 `increment()` 已通过 Viem/Wagmi 模拟，但不保证之后链上状态不会变化。
8. 点击 **模拟通过后递增**。
9. 在钱包中确认网络、合约地址和 gas。
10. 批准 Sepolia 测试交易。
11. 查看交易哈希、确认中状态、回执区块、Gas 使用量和执行状态。
12. 确认页面显示解析后的 `Incremented` 事件：
    - `caller`：调用者地址。
    - `newValue`：递增后的值。
13. 链上回执成功后，TanStack Query 会使相关读取失效并重新获取最新值。

模拟失败时不要强行发送；先检查网络、账户、RPC、合约地址和合约状态。

## 11. 操作 05：配置 ERC-20 测试代币

必须使用已部署在 Sepolia 的测试 ERC-20。不要配置主网代币。

1. 准备一个你了解的 Sepolia ERC-20 测试代币地址。
2. 准备用于授权额度练习的支出方地址。可以使用另一个测试账户，但不要使用陌生合约。
3. 在 `.env.local` 设置：

```dotenv
NEXT_PUBLIC_ERC20_ADDRESS=0x你的Sepolia测试代币地址
NEXT_PUBLIC_ERC20_SPENDER_ADDRESS=0x你的测试Spender地址
```

4. 重启开发服务器。
5. 连接 EVM 钱包并切换到 Sepolia。
6. 找到 **05 ERC-20 与 DeFi 基础操作**。
7. 检查页面显示的 token 地址。
8. 等待应用读取 `symbol()` 和 `decimals()`。
9. 检查 `代币余额` 和 `授权额度`。

如果 `decimals()` 读取失败，授权和转账按钮保持禁用，应用不会猜测 18 位精度后发交易。

## 12. 操作 05A：授权精确额度

代币授权允许支出方在之后代表所有者转移代币。它不会立即转移代币，而且授权会持续存在，直到被修改。

1. 再次确认 spender 地址属于你的测试范围。
2. 在 **授权精确额度** 的 `授权数量` 输入测试额度，例如 `1`。
3. 不要为了练习设置无限额度。
4. 点击 **模拟并授权**。
5. 应用先调用 `simulateContract`。
6. 模拟通过后钱包才会出现交易请求。
7. 在钱包中检查：
   - 网络是 Sepolia。
   - token 合约地址正确。
   - spender 地址正确。
   - 授权数量正确。
8. 批准交易。
9. 等待交易生命周期变为 `已确认`。
10. 检查解析后的 `Approval` 事件，包括所有者、支出方和原始数值。
11. 检查 `授权额度` 是否刷新为新值。

不再需要授权时，点击 **撤销授权**。页面会先模拟 `approve(spender, 0)`，确认后把 allowance 清零；撤销授权不会取回已经完成交易的资产。

## 13. 操作 05B：转账 ERC-20

1. 在 **转账代币** 的 `收款地址` 输入另一个测试账户地址。
2. 在 `转账数量` 输入小额测试代币数量。
3. 点击 **模拟并转账**。
4. 模拟通过后，在钱包中检查网络、token、收款地址和数量。
5. 批准交易。
6. 等待 receipt 确认。
7. 检查解析后的 `Transfer` 事件，包括发送方、接收方和原始数值。
8. 检查代币余额是否刷新。

## 14. 操作 05C：部署完整教学兑换

`LearningSwap.sol` 是一个只支持单个 `SLT ↔ Sepolia ETH` 交易对的教学资金池。它会真实接收 Sepolia 测试资产并执行兑换，但没有 LP 份额、路由、预言机或正式安全审计，不能用于主网和真实资金。

### 14A. 本地编译检查

项目使用 `solc-js` 编译两个学习合约，并检查前端需要的 ABI 是否存在：

```bash
node --test src/features/learning-swap/solidity.test.ts
```

预期：`LearningToken and LearningSwap compile with the frontend contract interface` 通过。

### 14B. 在 Remix 部署 LearningToken

1. 打开 Remix，创建 `LearningToken.sol`，复制 `contracts/LearningToken.sol`。
2. 使用兼容 `0.8.24` 的编译器编译。
3. 在 **Deploy & Run Transactions** 中选择浏览器扩展钱包，并确认钱包位于 Sepolia。
4. 选择 `LearningToken`，点击 **Deploy** 并批准测试网部署交易。
5. 复制 token 地址。部署账户会收到 `1000 SLT`，这是初始化和兑换练习使用的测试代币。

### 14C. 在 Remix 部署 LearningSwap

1. 创建 `LearningSwap.sol`，复制 `contracts/LearningSwap.sol`。
2. 编译后选择 `LearningSwap`。
3. 在构造参数 `tokenAddress` 中填写刚部署的 LearningToken 地址。
4. 确认钱包仍是 Sepolia，然后点击 **Deploy**。
5. 批准部署交易并复制 LearningSwap 地址。

构造参数会把唯一支持的 token 永久写入交换合约。页面之后会读取 `token()` 并与 `NEXT_PUBLIC_ERC20_ADDRESS` 比较；不一致时会禁止写入，避免操作错交易对。

### 14D. 配置页面

在 `.env.local` 设置：

```dotenv
NEXT_PUBLIC_ERC20_ADDRESS=0x你的LearningToken地址
NEXT_PUBLIC_ERC20_SPENDER_ADDRESS=0x你的LearningSwap地址
NEXT_PUBLIC_LEARNING_SWAP_ADDRESS=0x你的LearningSwap地址
```

然后重启：

```bash
npm run dev
```

这三个变量都是会进入浏览器的公开合约地址，不是 RPC，也不能填写私钥。`NEXT_PUBLIC_ERC20_SPENDER_ADDRESS` 设置成 LearningSwap 后，基础面板显示的 allowance 与完整兑换使用的是同一授权关系。

### 14E. owner 初始化资金池

1. 使用部署 LearningSwap 的同一账户连接页面。该账户是 `owner()`。
2. 页面先通过 Sepolia RPC 检查合约字节码、绑定 token、owner、初始化状态和储备；这些 `eth_call` 不花 Gas、不需要签名。
3. 在 **一次性初始化资金池** 输入初始数量，例如：

```text
100 SLT
0.1 Sepolia ETH
```

4. 点击 **第 1 步：模拟并授权 SLT**。页面先模拟 `approve`，通过后才请求钱包签名。
5. 授权确认后检查 `Approval` 事件。此时只设置代扣上限，SLT 仍在钱包中。
6. 页面刷新 allowance 后，点击 **第 2 步：模拟并注入两种储备**。
7. `initialize(tokenAmount)` 会通过 `transferFrom` 收取 SLT，同时接收交易的 `msg.value` ETH。
8. 等待 `Initialized` 事件并检查新储备。

100 SLT 与 0.1 ETH 形成约 `1 SLT = 0.001 ETH` 的初始隐含价格。这个价格不是外部市场价格，而是该独立资金池的储备比例；初始化只能执行一次。

### 14F. SLT 兑换 ETH

1. 选择 `SLT → ETH` 并输入少量 SLT，例如 `1`。
2. 页面通过只读合约函数取得当前报价，显示预计获得、0.3% 输入侧手续费、含费价格影响和最低到账。
3. 滑点默认 `0.5%`，可设置为 `0%～5%`。页面计算：

```text
minAmountOut = quote × (1 - slippage)
```

4. allowance 不足时点击 **第 1 步：精确授权 SLT**，等待授权交易确认。
5. 点击 **第 2 步：模拟并兑换**。页面在提交时生成 10 分钟 deadline，并模拟：

```text
swapTokenForEth(amountIn, minAmountOut, deadline)
```

6. 在钱包中检查 Sepolia、目标合约、调用内容和 Gas，然后批准。
7. 合约通过 `transferFrom` 收取 SLT，再向调用账户发送报价对应的 ETH。
8. 检查 `Swap` 事件、交易回执和刷新后的钱包余额与资金池储备。

### 14G. ETH 兑换 SLT

1. 选择 `ETH → SLT` 并输入极小 Sepolia ETH，例如 `0.001`。
2. 检查报价、手续费、价格影响、滑点与最低到账。
3. 直接点击 **模拟并兑换**。ETH 是原生资产，通过 `msg.value` 随交易进入合约，因此不需要 ERC-20 approve。
4. 页面模拟并发送：

```text
swapEthForToken(minAmountOut, deadline)
```

5. 在钱包中重点检查附带的 ETH 数量，并为 Gas 留出余额。
6. 合约接收 ETH 后发送 SLT；确认 `Swap` 事件和刷新后的两侧储备。

### 14H. 报价为什么会变化

资金池使用恒定乘积：

```text
x × y = k
```

输入资产增加、输出资产减少后，下一单位输入会得到更少输出，因此交易越大，价格影响越明显。0.3% 手续费通过只让输入的 99.7% 参与报价实现，手续费留在池中：

```text
amountInWithFee = amountIn × 9970
amountOut = amountInWithFee × reserveOut
          ÷ (reserveIn × 10000 + amountInWithFee)
```

RPC 报价只是某一时刻的快照。签名和打包期间储备可能变化；最终输出低于 `minAmountOut` 或执行时间超过 deadline 时，合约会回滚整笔兑换。资产不会只移动一半，但失败交易已经使用的 Gas 不会退回。

### 14I. owner 永久关闭

1. 只有当前 owner 会看到永久关闭表单。
2. 阅读警告并勾选确认框。
3. 点击 **模拟并永久关闭**，在钱包中确认 `close()`。
4. 合约先把 `closed` 写为 `true`，再把全部 SLT 和 ETH 储备发送给 owner。
5. 检查 `Closed` 事件。此后初始化和两个兑换方向都会永久回滚。

这是没有 LP 份额的教学简化，也是明显的中心化权限。真实 AMM 应按 LP 份额管理流动性，不能让单一管理员任意取回所有用户资金。

### 14J. 常见失败

1. **地址没有字节码**：确认 LearningSwap 部署在 Sepolia，并在修改环境变量后重启页面。
2. **绑定 token 不一致**：用正确 LearningToken 地址重新部署 LearningSwap，或修正 `NEXT_PUBLIC_ERC20_ADDRESS`。
3. **按钮不可用**：连接钱包、切换 Sepolia，并等待 owner、token、状态和储备读取完成。
4. **SLT 兑换失败**：检查 SLT 余额、LearningSwap allowance 和当前报价。
5. **ETH 兑换失败**：检查 Sepolia ETH 余额，并为 Gas 预留 ETH。
6. **滑点回滚**：储备在报价后发生变化；重新获取报价，谨慎调整 `0%～5%` 范围内的滑点。
7. **交易过期**：重新点击兑换，页面会生成新的 10 分钟 deadline。
8. **用户拒绝**：交易没有广播，也不会消耗 Gas；确认钱包内容后手动重试。
9. **RPC 失败**：检查网络和 `NEXT_PUBLIC_SEPOLIA_RPC_URL`，不要自动重复发送写交易。
10. **非标准代币**：转账税、通缩和 rebasing 代币会被精确到账检查拒绝，本演示只支持标准 LearningToken。

## 15. 操作 06：实时行情交易终端

实时模式统一使用 OKX 公共 `ETH-USDT-SWAP` 永续合约数据，不需要 API
Key。历史、ticker、逐笔成交和盘口不会混用不同交易所。

### 15A. 支持周期

顶部周期栏和 Advanced Charts 原生周期菜单支持：

```text
1s  1m  3m  5m  15m  30m  1h  2h  4h  12h  1D  3D  1week  1year
```

TradingView 分辨率分别为
`1S/1/3/5/15/30/60/120/240/720/1D/3D/1W/12M`。OKX
没有直接的年 K 线，`1year` 由 UTC 月线聚合，不能把一根月线伪装成年线。

### 15B. 历史 K 线与拖动加载

1. 打开 **行情** Tab。
2. Advanced Charts 调用 Datafeed `getBars`。
3. `src/app/api/market/candles/route.ts` 校验周期与参数，再代理 OKX
   `/api/v5/market/history-candles`。
4. 单次请求最多 300 根，这是 OKX 的单页规则，不是前端总历史限制。
5. 返回数据按时间升序、去重，并严格排除右边界 `to`。
6. 向右拖动图表、露出左侧更早区间时，Advanced Charts 会继续调用
   `getBars`。
7. 前端不设 7 天、总根数或总页数上限；直到 OKX 返回空数组，Datafeed 才返回
   `noData: true`。
8. 历史缓存由 Advanced Charts 自己管理，业务代码不再复制第二份无限增长的历史数组。

### 15C. 实时链路

```text
OKX public WS   ─ ticker / trades / books ─┐
OKX business WS ─ 当前周期 candle ──────────┤
                                            ▼
Web Worker：校验、盘口合并、队列上限、最新 K 线
                                            ▼
单个 in-flight 消息 + sequence
                                            ▼
主线程 requestAnimationFrame 合帧 → React commit → ACK
                                            ▼
TradingView subscribeBars 只接收匹配周期的最新 OHLCV
```

Worker 保留 100 档/侧盘口和 200 笔成交；盘口增量收到后直接合并，不建立等待队列。传给 UI
的只有最优 12 档、最近 8 笔成交、一个 ticker 和一根最新 K
线。历史数据不走这条实时队列，因此“历史不限总量”和“实时内存有上限”并不冲突。

Worker 同时只允许一个未 ACK 的渲染事件。React 忙时，新到数据覆盖 Worker
中的旧视觉状态，不会在主线程消息队列里排队。ACK
延迟或长任务触发后，刷新档位从 250ms 自动降到 500ms 或 1000ms；稳定 10
秒后逐级恢复。页面显示当前档位、ACK 延迟、原始消息数和渲染批次。

`requestAnimationFrame` 只是主线程最后一道合帧门，不承担 WebSocket
解析和固定 60Hz 更新。这样既与浏览器绘制节奏对齐，也不会因为后台页暂停 rAF
而让数据无限排队。

### 15D. 生命周期与兜底

- 页面隐藏、浏览器离线：通知 Worker 暂停，关闭两个 WebSocket，取消重连、快照请求和计时器。
- 页面重新可见或网络恢复：重新拉取快照，再恢复实时连接。
- 切换周期：只更换 candle 订阅，ticker/trades/books 保持不变。
- 切换实时/模拟：终止旧 Worker，重建一条干净数据链。
- 离开行情 Tab：卸载 Advanced Charts、调用 `chart.remove()`、终止 Worker，清理 rAF、观察器和 Datafeed 请求。
- 公司网络阻止 OKX：切换 **模拟**，继续验证相同的 Worker、背压和渲染路径。

`public/charting_library/` 复用本机 `web-next` 中的 `CL v27.006` 授权资源。该目录是私有分发包；部署或向第三方分发前，需要确认当前 TradingView Advanced Charts 授权覆盖目标环境。

## 16. 操作 06B：实时行情模拟模式

### 在界面中切换

1. 点击 **模拟**。
2. `连接状态` 应显示 `确定性的本地模拟数据流`。
3. 等待本地价格、K 线、盘口和逐笔成交更新。
4. 切换周期，确认模拟历史和最新 K 线同步变化，并经过与实时模式相同的批处理路径。

### 启动时默认使用模拟模式

1. 在 `.env.local` 设置：

```dotenv
NEXT_PUBLIC_MARKET_MODE=mock
```

2. 重启开发服务器。
3. 刷新页面，行情模块应直接进入模拟模式。

模拟模式的历史和实时数据都在本地生成，便于离线测试和浏览器冒烟验证。

### 为什么当前不引入 WebAssembly

当前热点是网络消息、JSON 校验、有限档位排序和主线程提交，Worker
已隔离计算，盘口也只有 100 档/侧。WASM
不会减少 React 提交或结构化克隆成本；只有性能分析确认 Worker
计算本身成为热点，并扩展到万档深度、回测或密码学计算时再评估。

## 17. 操作 07：连接 Solana Devnet 钱包

Solana 状态由独立的 `@solana/react` `ClientProvider` 管理，不与 EVM 钱包状态混合。

### 准备

1. 安装支持 Wallet Standard 且能明确切换 Devnet 的 Solana 浏览器钱包，建议使用 Solflare。
2. 在钱包中创建只用于测试的账户。
3. 按照 [Solflare 网络切换说明](https://help.solflare.com/en/articles/6328814-differences-between-mainnet-devnet-and-testnet-and-how-to-switch-between-on-solflare)，在钱包设置的 `Network` 中选择 `Devnet`。
4. 不要使用持有主网 SOL 的账户。
5. 刷新应用。

MetaMask 的原生 Solana 页面使用内置 RPC，不能手动配置 Solana RPC；详情见 [MetaMask 官方说明](https://support.metamask.io/configure/networks/navigating-solana)。MetaMask 的专用 Connect SDK 可以显式配置 Devnet，但本项目使用通用 Wallet Standard，而当前组合实测仍把签名窗口显示为 `Solana Mainnet`。为避免误签，本模块暂时过滤 MetaMask；MetaMask 仍可用于前面的 EVM/Sepolia 操作。

### 连接

1. 找到 **07 Solana Devnet 钱包、SOL 与 SPL Token**。
2. 点击 **连接 钱包名称**。
3. 在钱包中确认网站来源和 Devnet 测试账户。
4. 批准连接。
5. 页面应显示 `Solana 账户`、`钱包`、`网络` 和 `Devnet 余额`。

如果没有检测到钱包，页面显示说明，EVM 和其他模块仍可使用。

### 断开

1. 点击 **断开 Solana 连接**。
2. Solana 模块恢复未连接状态。
3. EVM 连接状态不受影响。

## 18. 操作 07B：发送 Devnet SOL

### 准备测试 SOL

1. 复制页面显示的 `Solana 账户`，它是公开地址，不是私钥。
2. 打开 [Solana 官方 Devnet 水龙头](https://faucet.solana.com/)。
3. 网络选择 `Devnet`，粘贴账户地址并申请 `1 SOL` 或 `2 SOL`。
4. 如果触发频率限制，稍后重试，或查看 [Solana 官方列出的其他领取方式](https://solana.com/developers/cookbook/development/airdrops-and-faucets)。
5. 确认钱包显示 Devnet，而不是 Mainnet Beta。
6. 回到应用并刷新页面或重新连接钱包，确认余额不再是 `0 SOL`。

已经安装 Solana CLI 时也可以执行：

```bash
solana airdrop 2 <你的公开钱包地址> --url devnet
solana balance <你的公开钱包地址> --url devnet
```

不要在水龙头或本项目中输入助记词、私钥，也不要购买所谓的 Devnet SOL。

### 发起转账

1. 连接 Solana 钱包。
2. 在 `收款地址` 输入另一个 Devnet 测试地址；不能与当前 Solana 账户相同。
3. 在 `金额（Devnet SOL）` 输入极小金额，例如：

```text
0.001
```

4. 点击 **发送 Devnet SOL**。
5. 应用使用 `@solana-program/system` 创建转账指令。
6. Solana 客户端会规划并预检交易。
7. 钱包弹窗出现后检查收款地址和数量。
8. 批准签名。
9. 页面显示 `请检查钱包，然后等待 Devnet 确认…`。
10. 确认后状态变为 `已确认`。
11. 页面显示交易签名。
12. 点击交易签名可打开 Solana 区块浏览器的 Devnet 页面。
13. 余额读取组件会刷新。

应用会在打开钱包前重新读取余额，并拦截余额不足或同地址转账。无效地址、非正数、钱包拒绝、RPC 或链上模拟错误都会进入 `失败`，写交易不会自动重试。

## 18C. 操作 07C：发送 Devnet SPL Token

1. 准备一个经典 SPL Token Program 的 Devnet Mint，并确保当前钱包对应的 ATA 中已有测试 Token；本演示不把 Token-2022 Mint 当作经典 Token 发送。
2. 可在 `.env.local` 设置默认 Mint 和展示符号，也可直接在页面输入：

```dotenv
NEXT_PUBLIC_SOLANA_TOKEN_MINT=你的DevnetMint地址
NEXT_PUBLIC_SOLANA_TOKEN_SYMBOL=你的符号
```

3. 点击 **读取 Token 与 ATA**。页面从链上读取 Mint 精度、推导当前钱包 ATA 并读取余额；不存在的源 ATA 显示余额为 0。
4. 在 `收款钱包地址` 输入对方钱包地址，不需要手动查询其 ATA。
5. 输入不超过当前余额的 Token 数量，然后点击 **模拟并发送 SPL Token**。
6. 页面会推导收款方 ATA，并在同一笔交易中加入幂等 ATA 创建指令和 `TransferChecked` 指令。
7. Solana 客户端默认先模拟计算量；模拟通过后才请求钱包签名并广播。
8. 确认后点击交易签名，在区块浏览器 Devnet 页面检查 ATA 创建和 Token 转账。

前端会拦截非正数、余额不足和给自己转账。ATA 创建租金及网络费由发送方支付，因此发送方仍需保留少量 Devnet SOL。

## 19. Sui Devnet：从 Move 源码到页面确认

### 19A. 安装并检查 Sui CLI

按 [Sui 官方安装文档](https://docs.sui.io/) 安装当前 Sui
CLI。不同系统的安装命令会变化，本仓库只依赖安装后的 `sui` 命令：

```bash
sui --version
sui client envs
sui client addresses
```

如果还没有 Devnet 环境或测试地址：

```bash
sui client new-env --alias devnet --rpc https://fullnode.devnet.sui.io:443
sui client switch --env devnet
sui client new-address ed25519 demo
sui client switch --address demo
sui client active-env
sui client active-address
```

已有同名 `devnet` 或已有测试地址时，不要重复创建，直接 `switch`。
CLI 私钥保存在本机 keystore，不要复制到 `.env.local`。

### 19B. 获取 Devnet SUI

```bash
sui client faucet
sui client gas
```

水龙头限流时稍后重试。页面连接的是浏览器钱包；如果 CLI
地址和浏览器钱包地址不同，需要分别为两者申请 Devnet SUI。

### 19C. 阅读、构建和测试 Move Counter

先读：

```text
contracts/sui-counter/Move.toml
contracts/sui-counter/sources/counter.move
```

`init` 在发布时创建并共享一个 `Counter`；`increment(&mut Counter)`
没有管理员能力限制，所以任意测试钱包都能递增。它只演示共享对象并发入口，不包含
NFT、Coin、DEX 或管理员功能。

```bash
cd contracts/sui-counter
sui move build
sui move test
```

预期：构建成功，`increments` 测试通过。

### 19D. 发布并取得两个不同 ID

确认当前环境确实是 Devnet 后发布：

```bash
sui client active-env
sui client publish --gas-budget 100000000 --json > publish.json
```

从发布结果读取：

```bash
jq -r '.objectChanges[] | select(.type == "published") | .packageId' publish.json
jq -r '.objectChanges[] | select(.type == "created" and (.objectType | endswith("::counter::Counter"))) | .objectId' publish.json
```

- **Package ID**：Move 代码地址，页面用它组成
  `<PACKAGE_ID>::counter::increment`。
- **Counter Object ID**：`init` 创建的共享状态对象，页面把它作为
  `transaction.object(...)` 传入。

两者不能互换。若 CLI 输出格式变化，直接在发布结果或
[Suiscan Devnet](https://suiscan.xyz/devnet/home) 中找到 published package 和
shared `::counter::Counter` created object。

### 19E. 配置并操作页面

回到仓库根目录，在 `.env.local` 填入：

```dotenv
NEXT_PUBLIC_SUI_RPC_URL=https://fullnode.devnet.sui.io:443
NEXT_PUBLIC_SUI_COUNTER_PACKAGE_ID=0x你的PackageID
NEXT_PUBLIC_SUI_COUNTER_OBJECT_ID=0x你的共享CounterObjectID
```

重启 `npm run dev`，进入 **Sui Devnet** Tab：

1. 使用 Slush、Suiet 等 Wallet Standard 浏览器钱包连接 Devnet 测试账户。
2. 核对网络、地址和余额。
3. 输入另一个 Sui Devnet 地址和极小数量，发送测试 SUI。
4. 等待 Digest 最终确认，再从 Suiscan Devnet 检查交易。
5. 检查共享 Counter 当前值。
6. 点击 **Counter +1**，在钱包核对 Move Call。
7. 确认后页面重新读取同一个 Counter Object，显示新值。

SUI 转账流为：校验地址/金额 → 构造 `Transaction` → 钱包签名执行 →
`waitForTransaction` → 刷新余额。Counter 流为：读取共享 Object →
`moveCall` → 钱包签名执行 → 最终确认 → 重读 Object。

> Sui Devnet 可能重置。重置后旧 Package ID、Object ID 和测试币都可能失效；
> 重新领取 SUI、发布包并更新 `.env.local` 即可。不要把 Devnet ID 当成永久生产配置。

## 20. TanStack Query 与 Next.js 提供者结构

1. `src/app/layout.tsx` 是服务端组件。
2. `src/app/providers.tsx` 是客户端边界。
3. `WagmiProvider` 提供 EVM 配置。
4. `QueryClientProvider` 位于 Wagmi 提供者内部，并持有一个稳定的 `QueryClient`。
5. Wagmi 使用 TanStack Query 缓存和去重 RPC 读取。
6. 链上回执成功后，应用使相关查询失效，让余额、授权额度和合约读取刷新。
7. 应用没有另外复制一份 Wagmi 钱包状态。
8. Solana 模块通过动态客户端加载并拥有独立 provider，避免 SSR 浏览器 API 和 hydration 问题。
9. Sui 模块在自己的动态客户端边界中创建 `DAppKitProvider`，并固定单一
   `devnet` 客户端；三条链不会共享钱包连接状态。

## 21. 交易生命周期如何阅读

对 EVM 原生转账、Counter 和 ERC-20，可按以下顺序判断：

1. `待操作`：尚未操作。
2. `等待钱包确认`：交易还在钱包中等待用户确认。
3. `已提交`：已经广播并取得交易哈希，但不代表成功。
4. `确认中`：正在等待链上回执。
5. `已确认`：链上回执已返回；还要检查回执状态。
6. `失败`：钱包、RPC、模拟或链上执行失败。

Sui 页面以 `waitForTransaction` 完成最终确认；Solana 页面使用客户端确认结果。
生产应用还应根据链和业务风险设置确认策略，并明确处理 EVM 交易替换和链重组。

## 22. 错误排查步骤

### 页面没有 EVM 钱包按钮或连接失败

1. 确认扩展已安装并启用。
2. 解锁钱包。
3. 刷新 `http://localhost:3000`。
4. 检查扩展是否允许当前浏览器配置文件访问 localhost。

### 网络错误

1. 点击 **切换到 Sepolia**。
2. 如果钱包不支持自动切换，手动选择 Sepolia。
3. 检查 chain ID 是 `11155111`。

### 测试资金不足

1. 检查当前账户和测试网络。
2. 从对应测试网 faucet 获取测试资金。
3. 缩小测试金额。
4. 不要切换到主网获取真实资金。

### Counter 不可用

1. 检查 `NEXT_PUBLIC_COUNTER_ADDRESS` 是否是有效 EVM 地址。
2. 在 Sepolia 区块浏览器检查该地址是否有合约代码。
3. 确认部署网络是 Sepolia。
4. 修改环境变量后重启开发服务器。

### ERC-20 按钮不可用

1. 确认 token 地址和 spender 地址有效。
2. 确认钱包已连接并位于 Sepolia。
3. 等待 token `decimals()` 成功返回。
4. 检查公共 RPC 是否限流。

### 实时行情无数据

1. 点击 **模拟** 验证本地界面路径。
2. 检查浏览器或公司网络是否阻止 OKX public/business WebSocket。
3. 直接访问 `/api/market/candles?resolution=1&limit=2`，确认服务端可访问
   OKX REST。
4. 查看状态是否正在指数退避重连。

### Solana 钱包不可见

1. 如果使用 MetaMask，改用能够明确切换 Devnet 的 Solflare；当前 MetaMask + 通用 Wallet Standard 组合会打开 Solana Mainnet 签名，因此本模块暂不列出它。
2. 解锁 Solflare，在设置的 `Network` 中选择 `Devnet`。
3. 刷新页面并重新连接。
4. 确认扩展允许 localhost。
5. 如果钱包签名窗口仍显示 `Solana Mainnet`，立即点击取消，不要确认交易。

### Sui Counter 不可用

1. 确认钱包网络是 Sui Devnet。
2. 检查 Package ID 与 Counter Object ID 没有填反。
3. 在 Suiscan Devnet 检查 Object 的类型以
   `::counter::Counter` 结尾且 owner 为 Shared。
4. Devnet 若已重置，重新发布并更新两个环境变量。
5. 修改 `.env.local` 后必须重启开发服务器。

## 23. 质量检查：每条命令及预期结果

### 格式检查

项目通过 `prettier-plugin-solidity` 让同一套 Prettier 命令同时处理 TypeScript、TSX、CSS、Markdown 和 `contracts/*.sol`，不需要单独维护另一套 Solidity 格式工具。

格式化全部源码：

```bash
npm run format
```

只格式化 Solidity：

```bash
npx prettier --write "contracts/**/*.sol"
```

只检查、不修改：

```bash
npx prettier --check .
```

预期：包括 `.sol` 在内的所有匹配文件都符合 Prettier 格式。

### ESLint

```bash
npm run lint
```

预期：退出码为 0，没有 ESLint 错误。

### TypeScript

```bash
npm run typecheck
```

预期：`tsc --noEmit` 退出码为 0。

### 聚焦测试

```bash
npm test
```

预期：全部测试通过，包括钱包错误、SOL/SPL 预检、OKX REST/WS
解析、TradingView Datafeed、Level2、年 K 线聚合、Sui Counter JSON、EVM
Counter ABI、Gas 预算、滑点边界、LearningSwap ABI 和 Solidity 编译检查。

Move 合约使用 Sui CLI 单独验证：

```bash
cd contracts/sui-counter
sui move build
sui move test
```

### Next.js 生产构建

```bash
npm run build
```

预期：编译、TypeScript、静态页面生成全部成功。

### 生产启动

先完成 build，再运行：

```bash
npm run start
```

然后打开 `http://localhost:3000`。验证完成后按 `Ctrl+C`。

### 手动执行提交前钩子

```bash
.husky/pre-commit
```

hook 会依次运行：

1. `npx lint-staged`
2. `npm run typecheck`
3. `npm run test`

如果没有暂存文件，lint-staged 会提示没有暂存文件，后两项仍会执行。

### 依赖审计

```bash
npm audit
```

不要直接执行盲目的 `npm audit fix --force`；先确认安全公告是否进入生产依赖路径以及升级是否兼容。

## 24. 本演示实际证明的 JD 能力

1. **React、TypeScript、Next.js**：应用路由、服务端/客户端边界、受控表单、类型化 hooks、可安全水合的可选模块。
2. **EVM 钱包与 RPC**：浏览器扩展 EIP-1193 钱包、可选 WalletConnect、Sepolia 网络锁定、账户/余额/切链。
3. **智能合约交互**：ABI 类型化读取、写入前模拟、链上回执、事件日志解析和状态刷新。
4. **ERC-20/DeFi 完整流程**：元数据、余额、精确授权/撤销、转账、资金池初始化、恒定乘积报价、手续费、价格影响、滑点、最低到账、截止时间、Gas 最大支出和双向兑换。
5. **实时交互体验**：钱包提示、已提交、两次确认、失败、交易哈希、链上历史和区块浏览器。
6. **实时数据和性能**：OKX REST 分页与 public/business WebSocket、14
   个周期、TradingView Datafeed、Worker、rAF 合帧、ACK
   背压、长任务降级、生命周期回收、数据新鲜度和有界实时队列。
7. **Solana**：Wallet Standard、Devnet SOL、SPL Token、Mint/ATA 读取、幂等 ATA 创建、TransferChecked、模拟/签名/发送/确认和独立状态。
8. **Sui**：当前 dApp Kit、gRPC Devnet 客户端、SUI
   转账、Package/Object 区分、共享 Move Object 读取与写入。
9. **稳定性与安全**：不托管私钥、测试网限制、输入校验、EVM RPC 故障切换与健康状态、错误归一化、禁止盲目重试写交易、缺省配置不崩溃。
10. **工程质量**：Solidity/Move 检查、ESLint、Prettier、TypeScript、聚焦测试、Next 生产构建、lint-staged 和 Husky。

## 25. 本演示只解释、不假装证明的内容

1. 多交易对路由、真实报价聚合、预言机、MEV/防夹和滑点的生产策略。
2. LP 份额、任意用户加减流动性、手续费分配、闪电贷和协议治理。
3. 生产监控、告警、CSP、安全响应头和完整供应链治理。
4. WalletConnect 生产会话、元数据、移动端和硬件钱包兼容矩阵。
5. 大规模前端架构、多团队协作、事故响应、完整本地 EVM 集成测试和正式安全审计。
6. Rust 和 Solana 链上程序开发。

本项目故意不添加下单、仓位、保证金、风控、业务数据库、索引器、
Hardhat/Foundry、Rust 或 WebAssembly。Next.js Route Handler 只做无状态
OKX REST 代理；Sui Counter 保持单一共享对象示例。

## 26. 面试讲解要点

1. 公共读取客户端与需要用户授权的钱包客户端必须分开。
2. 交易哈希只代表已经广播，链上回执状态才说明执行结果。
3. simulation 能捕获许多确定性错误，但模拟后状态仍可能变化。
4. 用户拒绝是正常结果，不是需要自动恢复的异常。
5. 只缓存可安全重复的读取；确认写入后再使权威状态查询失效。
6. 不在另一个全局 store 中复制 Wagmi 钱包状态。
7. 网络接收频率和 React 渲染频率应分离；限制实时队列，但历史 K
   线按数据源规则分页，不能用总根数硬截断用户查询。
8. EVM 强调链 ID、Gas、nonce 和回执；Solana 强调集群、账户与确认级别；Sui
   强调 Package、owned/shared Object 和 PTB。
9. 三条链的用户体验都遵循：准备 → 预检 → 签名 → 提交 → 确认 → 权威状态校准。

## 27. 从哪里开始读代码，到哪里结束

建议严格按下面顺序读，能够从入口一路串到外部链和行情源：

```text
01 package.json / .env.example
   └─ 依赖、脚本、所有公开配置

02 src/app/page.tsx → layout.tsx → providers.tsx → WalletLab.tsx
   └─ Next 入口、EVM Query Provider、四个 Tab 与按需挂载

03 EVM Tab
   ├─ src/shared/evm/config.ts
   ├─ src/features/evm-wallet/
   ├─ src/features/counter/ → contracts/Counter.sol
   └─ src/features/erc20/ → src/features/learning-swap/
      └─ contracts/LearningToken.sol / LearningSwap.sol

04 Solana Devnet Tab
   └─ src/features/solana/solanaClient.ts
      → src/features/solana/SolanaPanel.tsx

05 Sui Devnet Tab
   ├─ contracts/sui-counter/Move.toml
   ├─ contracts/sui-counter/sources/counter.move
   ├─ src/features/sui/suiClient.ts
   └─ src/features/sui/SuiPanel.tsx

06 行情 Tab
   ├─ src/features/market/MarketPanel.tsx
   ├─ src/features/market/TradingViewChart.tsx
   ├─ src/features/market/tradingViewDatafeed.ts
   │  └─ src/app/api/market/candles/route.ts → OKX history-candles
   ├─ src/features/market/marketWorker.ts
   │  └─ OKX public/business WebSocket
   ├─ src/app/api/market/snapshot/route.ts → OKX candles/books
   └─ src/features/market/marketData.ts

07 src/shared/errors.ts → src/**/*.test.ts → .husky/pre-commit
   └─ 跨链错误、纯逻辑边界和最终质量门
```

实际调试也按这个方向：入口状态 → 当前 Tab → 交易/数据适配层 → RPC/WS
边界 → 纯函数测试。不要从 15MB 的 `public/charting_library/`
内部源码开始；它是授权静态资源，业务接入点是 `TradingViewChart.tsx` 和
`tradingViewDatafeed.ts`。
