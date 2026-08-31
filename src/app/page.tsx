// App Router 的首页只负责挂载完整实验室，业务状态留在客户端组件中。
import { WalletLab } from './WalletLab'

export default function Page() {
  return <WalletLab />
}
