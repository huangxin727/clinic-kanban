import { loginUser, registerUser, createToken } from '@/lib/auth'
import { cachedHandler } from '@/lib/helpers'

export default cachedHandler(async function handler(req, res) {
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
      user = await registerUser(email, password)
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
