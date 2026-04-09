import { loginUser, registerUser, createToken } from '@/lib/auth'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { email, password, mode } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: '请填写邮箱和密码' })
  }
  if (password.length < 6) {
    return res.status(400).json({ error: '密码至少6位' })
  }

  try {
    let user
    if (mode === 'register') {
      return res.status(403).json({ error: '已关闭公开注册，请联系组长添加账号' })
    } else {
      user = await loginUser(email, password)
    }

    const token = await createToken(user)
    // 不返回密码
    const { password: _, ...safeUser } = user

    return res.json({ success: true, token, user: safeUser })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
}
