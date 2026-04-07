import { getUserMember, getUser } from '@/lib/helpers'
import { findBy, KEYS, addToList } from '@/lib/db'

export default async function handler(req, res) {
  const member = await getUserMember(req)
  if (!member) return res.status(401).json({ error: '未授权' })

  const user = await getUser(req)

  if (req.method === 'GET') {
    return res.json({
      success: true,
      data: member,
      email: user?.email
    })
  }

  if (req.method === 'POST') {
    const { name, role, color } = req.body
    if (!name) return res.status(400).json({ error: '请填写姓名' })

    // 检查是否已存在
    const existing = await findBy(KEYS.MEMBERS, 'user_id', user.id)
    if (existing) {
      return res.status(400).json({ error: 'Profile 已存在' })
    }

    // 检查是否是管理员邮箱
    const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL
    const isAdmin = adminEmail && user.email?.toLowerCase() === adminEmail.toLowerCase()

    const newMember = {
      id: 'm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      user_id: user.id,
      name,
      role: role || '全能',
      color: color || '#2563eb',
      is_admin: isAdmin,
      status: 'free',
      created_at: new Date().toISOString(),
    }
    await addToList(KEYS.MEMBERS, newMember)

    return res.json({ success: true, data: newMember })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
