// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// OpenZeppelin 提供经过广泛使用的所有权、ERC-20 安全调用和重入保护，避免教学合约重复造安全轮子。
import {Ownable} from "@openzeppelin/contracts@5.6.1/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts@5.6.1/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts@5.6.1/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts@5.6.1/utils/ReentrancyGuard.sol";

/**
 * 单个 ERC-20 与 Sepolia ETH 的教学资金池。
 *
 * 价格不来自交易所或预言机，而由合约当前持有的两种资产储备决定。
 * 兑换遵循 x*y=k，并从输入中保留 0.3% 手续费。它刻意没有 LP 份额，
 * 因此只有 owner 能初始化并永久关闭资金池，不适合真实资金或生产环境。
 */
contract LearningSwap is Ownable, ReentrancyGuard {
    // using 后可写 token.safeTransfer(...)；SafeERC20 会兼容“返回 bool”与“不返回值”的标准代币。
    using SafeERC20 for IERC20;

    // 10_000 表示 100.00%；基点整数运算不会引入 JavaScript/浮点数那样的精度误差。
    uint256 private constant FEE_DENOMINATOR = 10_000;
    // 输入只取 9_970/10_000 参与报价，差额 30/10_000 就是 0.3% 手续费，并留在池中。
    uint256 private constant AMOUNT_IN_AFTER_FEE = 9_970;

    // immutable 表示 token 地址只在构造时写一次，部署后不能换成另一个交易对。
    IERC20 public immutable token;
    // public 状态变量会由 Solidity 自动生成同名只读函数，前端可直接通过 ABI 查询。
    bool public initialized;
    bool public closed;

    // 自定义 error 比长字符串 revert 更省 Gas；名称同时告诉前端失败属于哪类保护条件。
    error InvalidToken();
    error InvalidAmount();
    error PoolAlreadyInitialized();
    error PoolNotInitialized();
    error PoolClosed();
    error EmptyReserves();
    error ZeroOutput();
    error DeadlineExpired();
    error InsufficientOutput(uint256 actual, uint256 minimum);
    error UnsupportedTokenTransfer();
    error EthTransferFailed();
    error DirectEthNotAccepted();
    error OwnershipRenounceDisabled();

    // event 会写入交易回执 logs。前端借助 ABI 解码，展示这笔交易实际完成了什么。
    event Initialized(
        address indexed owner,
        uint256 tokenAmount,
        uint256 ethAmount
    );
    event Swap(
        address indexed account,
        bool tokenToEth,
        uint256 amountIn,
        uint256 amountOut
    );
    event Closed(address indexed owner, uint256 tokenAmount, uint256 ethAmount);

    /**
     * 部署时传入唯一支持的 ERC-20 地址，msg.sender 成为 owner。
     * address(0) 没有代币合约，若允许它进入会让后续 balanceOf/transfer 调用失去意义。
     */
    constructor(address tokenAddress) Ownable(msg.sender) {
        if (tokenAddress == address(0)) revert InvalidToken();
        token = IERC20(tokenAddress);
    }

    /**
     * owner 先在 token 合约授权本合约，再把初始 token 和 msg.value 一次性注入。
     * initialized 在外部转账完成后才写入；任一步 revert 时，整个交易都会回滚。
     */
    function initialize(
        uint256 tokenAmount
    ) external payable onlyOwner nonReentrant {
        if (closed) revert PoolClosed();
        if (initialized) revert PoolAlreadyInitialized();
        if (tokenAmount == 0 || msg.value == 0) revert InvalidAmount();

        // 先确认合约实际收到了完整 token，再把 initialized 写为 true；失败会回滚包括 ETH 在内的全部变化。
        _receiveExactTokens(msg.sender, tokenAmount);
        initialized = true;

        emit Initialized(msg.sender, tokenAmount, msg.value);
    }

    /**
     * 返回合约此刻真正持有的两种资产余额。
     * 本教学池不维护另一份 reserve 变量，避免“内部账本”和实际资产余额不一致。
     */
    function getReserves()
        external
        view
        returns (uint256 tokenReserve, uint256 ethReserve)
    {
        return (token.balanceOf(address(this)), address(this).balance);
    }

    /** 只读计算 token→ETH 预计输出；eth_call 不改链、不花 Gas，也不保证稍后一定按此价格成交。 */
    function quoteTokenForEth(
        uint256 tokenAmountIn
    ) external view returns (uint256 ethAmountOut) {
        _requireActive();
        return
            _quote(
                tokenAmountIn,
                token.balanceOf(address(this)),
                address(this).balance
            );
    }

    /** 只读计算 ETH→token 预计输出，公式与真实兑换共用 _quote，避免报价和成交使用两套算法。 */
    function quoteEthForToken(
        uint256 ethAmountIn
    ) external view returns (uint256 tokenAmountOut) {
        _requireActive();
        return
            _quote(
                ethAmountIn,
                address(this).balance,
                token.balanceOf(address(this))
            );
    }

    /**
     * token→ETH 需要 allowance，因为合约要用 transferFrom 从调用者账户取 token。
     * minAmountOut 和 deadline 把前端报价变成链上强制条件，储备变化过大或交易过期都会整笔回滚。
     */
    function swapTokenForEth(
        uint256 tokenAmountIn,
        uint256 minAmountOut,
        uint256 deadline
    ) external nonReentrant {
        _requireActive();
        _requireTrade(tokenAmountIn, minAmountOut, deadline);

        // 必须在收取用户 token 之前读取储备，否则本次输入会被错误地算进 reserveIn。
        uint256 ethAmountOut = _quote(
            tokenAmountIn,
            token.balanceOf(address(this)),
            address(this).balance
        );
        if (ethAmountOut < minAmountOut) {
            revert InsufficientOutput(ethAmountOut, minAmountOut);
        }

        // effects/interactions：报价保护已检查；随后精确收 token，再用底层 call 发送原生 ETH。
        // nonReentrant 会阻止接收方合约在 ETH 回调期间再次进入本函数。
        _receiveExactTokens(msg.sender, tokenAmountIn);
        (bool sent, ) = payable(msg.sender).call{value: ethAmountOut}("");
        if (!sent) revert EthTransferFailed();

        emit Swap(msg.sender, true, tokenAmountIn, ethAmountOut);
    }

    /**
     * ETH→token 不需要 ERC-20 approve；ETH 已随 msg.value 进入合约。
     * address(this).balance 已包含 msg.value，所以报价必须减去本次输入，得到交易前的 ETH 储备。
     */
    function swapEthForToken(
        uint256 minAmountOut,
        uint256 deadline
    ) external payable nonReentrant {
        _requireActive();
        _requireTrade(msg.value, minAmountOut, deadline);

        // payable 函数开始执行时，msg.value 已计入 address(this).balance；减掉它才是交易前 ETH 储备。
        uint256 tokenAmountOut = _quote(
            msg.value,
            address(this).balance - msg.value,
            token.balanceOf(address(this))
        );
        if (tokenAmountOut < minAmountOut) {
            revert InsufficientOutput(tokenAmountOut, minAmountOut);
        }

        // 比较收款人前后余额，确保对方真正收到完整数量；有转账税的代币会在这里整体回滚。
        uint256 balanceBefore = token.balanceOf(msg.sender);
        token.safeTransfer(msg.sender, tokenAmountOut);
        if (token.balanceOf(msg.sender) - balanceBefore != tokenAmountOut) {
            revert UnsupportedTokenTransfer();
        }

        emit Swap(msg.sender, false, msg.value, tokenAmountOut);
    }

    /**
     * 本教学池没有 LP 份额。owner 关闭时取回全部储备，且 closed 先写入，
     * 防止外部转账期间再次进入；关闭后不能重新初始化或兑换。
     */
    function close() external onlyOwner nonReentrant {
        _requireActive();
        // 先永久关闭，再执行 token/ETH 外部调用；即使收款方是合约，也不能趁回调再次兑换。
        closed = true;

        // 余额先保存下来，既用于转账，也用于 Closed 事件向前端说明取回了多少储备。
        uint256 tokenAmount = token.balanceOf(address(this));
        uint256 ethAmount = address(this).balance;
        address recipient = owner();

        if (tokenAmount > 0) token.safeTransfer(recipient, tokenAmount);
        if (ethAmount > 0) {
            (bool sent, ) = payable(recipient).call{value: ethAmount}("");
            if (!sent) revert EthTransferFailed();
        }

        emit Closed(recipient, tokenAmount, ethAmount);
    }

    /** 禁止放弃所有权，避免资金池失去唯一可关闭和取回储备的账户。 */
    function renounceOwnership() public pure override {
        revert OwnershipRenounceDisabled();
    }

    /**
     * transferFrom 依赖用户提前 approve。本函数还检查实际余额增量，明确拒绝转账税/通缩 token。
     * SafeERC20 调用或余额检查失败时会 revert，调用它的初始化/兑换交易也会原子回滚。
     */
    function _receiveExactTokens(address from, uint256 amount) private {
        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(from, address(this), amount);
        if (token.balanceOf(address(this)) - balanceBefore != amount) {
            revert UnsupportedTokenTransfer();
        }
    }

    /** 把“已初始化且未关闭”的共同前置条件集中检查，两个报价和三个写入口使用同一规则。 */
    function _requireActive() private view {
        if (closed) revert PoolClosed();
        if (!initialized) revert PoolNotInitialized();
    }

    /** 检查输入、最低到账和时效；minAmountOut=0 会失去滑点保护，因此也被拒绝。 */
    function _requireTrade(
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 deadline
    ) private view {
        if (amountIn == 0 || minAmountOut == 0) revert InvalidAmount();
        if (block.timestamp > deadline) revert DeadlineExpired();
    }

    /**
     * 恒定乘积报价：amountOut = amountInWithFee*reserveOut /
     * (reserveIn*10_000 + amountInWithFee)。所有值都是最小单位整数，除法会向下取整。
     */
    function _quote(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) private pure returns (uint256 amountOut) {
        if (amountIn == 0) revert InvalidAmount();
        if (reserveIn == 0 || reserveOut == 0) revert EmptyReserves();

        // 手续费不转给单独账户；只有 99.7% 输入推动价格，剩余 0.3% 留在资金池储备中。
        uint256 amountInWithFee = amountIn * AMOUNT_IN_AFTER_FEE;
        amountOut =
            (amountInWithFee * reserveOut) /
            (reserveIn * FEE_DENOMINATOR + amountInWithFee);
        if (amountOut == 0) revert ZeroOutput();
    }

    /** ETH 必须通过 initialize 或 swapEthForToken 进入，普通转账没有业务含义。 */
    receive() external payable {
        revert DirectEthNotAccepted();
    }
}
