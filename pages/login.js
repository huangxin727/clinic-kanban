import { useState, useEffect } from 'react'
import { login } from '@/lib/client'
import { useRouter } from 'next/router'
import Head from 'next/head'

export default function LoginPage() {
  const router = useRouter()

  // 迁移旧 localStorage token 到 sessionStorage
  useEffect(() => {
    const oldToken = localStorage.getItem('kanban_token')
    const oldUser = localStorage.getItem('kanban_user')
    if (oldToken && !sessionStorage.getItem('kanban_token')) {
      sessionStorage.setItem('kanban_token', oldToken)
      if (oldUser) sessionStorage.setItem('kanban_user', oldUser)
    }
    localStorage.removeItem('kanban_token')
    localStorage.removeItem('kanban_user')
  }, [])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      await login(email, password)
      router.push('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Head><title>登录 · 工单看板</title></Head>
      <div className="login-page">
        <div className="login-card">
          <h2>🏥 实施工单看板</h2>
          <p>诊所SaaS实施售后组专用工作台</p>

          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <label>邮箱</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="请输入您的邮箱"
                required
              />
            </div>
            <div className="form-row">
              <label>密码</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="请输入密码"
                required
                minLength={6}
              />
            </div>

            {error && (
              <div style={{ background: '#fef2f2', color: '#dc2626', padding: '10px 12px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? '请稍候...' : '登 录'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text-muted)' }}>
            请联系组长获取登录账号
          </div>
        </div>
      </div>
    </>
  )
}
