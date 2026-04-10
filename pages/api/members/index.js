import { getUserMember } from '@/lib/helpers'
import { getAll, addToList, updateById, removeById, KEYS, genId, findBy, touchUpdate } from '@/lib/db'
import { hashPassword } from '@/lib/auth'

export default async function handler(req, res) {
  const member = await getUserMember(req)
  if (!member) return res.status(401).json({ error: '未授权' })

  if (req.method === 'GET') {
    const data = await getAll(KEYS.MEMBERS)
    // 按创建时间排序
    data.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    return res.json({ success: true, data })
  }

  if (req.method === 'POST') {
    if (!member.is_admin) return res.status(403).json({ error: '仅组长可操作' })

    const { name, role, status, color, email, password } = req.body
    if (!name) return res.status(400).json({ error: '请填写姓名' })
    if (!email) return res.status(400).json({ error: '请填写登录邮箱' })
    if (!password || password.length < 6) return res.status(400).json({ error: '密码至少6位' })

    // 检查邮箱是否已注册
    const existingUser = await findBy(KEYS.USERS, 'email', email.toLowerCase())
    if (existingUser) return res.status(400).json({ error: '该邮箱已被使用' })

    // 创建登录账号
    const hashedPassword = await hashPassword(password)
    const userId = 'u_' + genId()
    await addToList(KEYS.USERS, {
      id: userId,
      email: email.toLowerCase(),
      password: hashedPassword,
      created_at: new Date().toISOString(),
    })

    const newMember = {
      id: 'm_' + genId(),
      name,
      role: role || '全能',
      status: status || 'free',
      color: color || '#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0'),
      is_admin: false,
      user_id: userId,
      email: email.toLowerCase(),
      created_at: new Date().toISOString(),
    }
    await addToList(KEYS.MEMBERS, newMember)
    await touchUpdate()
    return res.json({ success: true, data: newMember })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
