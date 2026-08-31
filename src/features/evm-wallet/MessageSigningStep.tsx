'use client'

import { useState } from 'react'
import { useConnection, useSignMessage } from 'wagmi'
import { sepolia } from 'wagmi/chains'

import { getErrorMessage } from '../../shared/errors'

// 第 02 步只演示消息签名：它证明账户控制权，但不会发送链上交易或消耗 Gas。
export function MessageSigningStep() {
  const connection = useConnection()
  const signMessage = useSignMessage()
  const [message, setMessage] = useState(
    '我正在 Sepolia 上学习安全的 Web3 交易流程。',
  )
  const [signature, setSignature] = useState('')
  const [signError, setSignError] = useState('')
  const canSign = connection.isConnected && connection.chainId === sepolia.id

  // 点击按钮后才请求钱包签名；空消息先在页面中拦截，不打扰钱包。
  async function handleSign() {
    setSignature('')
    setSignError('')
    if (!message.trim()) {
      setSignError('请先输入要签名的消息。')
      return
    }
    try {
      const signMsg = await signMessage.mutateAsync({ message })
      setSignature(signMsg)
    } catch (error) {
      setSignError(getErrorMessage(error))
    }
  }

  return (
    <section>
      {/* 阅读原文 → 请求签名 → 保存签名结果，是最基础的链下签名流程。 */}
      <span className="step">02</span>
      <h2>签名消息</h2>
      <p className="muted">
        这是不消耗 Gas
        的链下操作，用于证明账户控制权。签名仍可能授予权限，因此必须检查消息原文。
      </p>
      <label>
        消息内容
        <textarea
          onChange={(event) => setMessage(event.target.value)}
          rows={3}
          value={message}
        />
      </label>
      <button
        disabled={!canSign || signMessage.isPending}
        onClick={handleSign}
        type="button"
      >
        {signMessage.isPending ? '请检查钱包…' : '签名消息'}
      </button>
      {signature && (
        <output className="result mono">签名结果：{signature}</output>
      )}
      {(signError || signMessage.error) && (
        <p className="error">
          {signError || getErrorMessage(signMessage.error)}
        </p>
      )}
    </section>
  )
}
