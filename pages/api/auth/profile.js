import { getUser } from '@/lib/helpers'
import { findBy, updateById, KEYS, addToList } from '@/lib/db'

export default async function handler(req, res) {
  // 先验证用户身份
  const user = await getUser(req)
  if (!user) return res.status(401).json({ error: '未授权' })

  if (req.method === 'GET') {
    const { getAll } = await import('@/lib/db')
    const allMembers = await getAll(KEYS.MEMBERS)

    // 1. 先按 user_id 查找（新流程创建的成员）
    let member = allMembers.find(m => m.user_id === user.id)

    // 2. 兼容旧数据：按 email 查找
    if (!member && user.email) {
      member = allMembers.find(m => m.email?.toLowerCase() === user.email.toLowerCase())
    }

    // 3. 兜底：如果登录邮箱是管理员邮箱，且存在无 user_id 的管理员 member，自动关联
    if (!member && user.email) {
      const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL
      if (adminEmail && user.email.toLowerCase() === adminEmail.toLowerCase()) {
        const adminMember = allMembers.find(m => m.is_admin && !m.user_id)
        if (adminMember) {
          member = adminMember
        }
      }
    }

    // 自动补关联 user_id 和 email
    if (member && !member.user_id) {
      const updates = { user_id: user.id }
      if (!member.email && user.email) updates.email = user.email.toLowerCase()
      await updateById(KEYS.MEMBERS, member.id, updates)
      member = { ...member, ...updates }
    }

    if (!member) {
      return res.json({ success: true, data: null, email: user.email })
    }
    return res.json({
      success: true,
      data: member,
      email: user.email
    })
  }

  if (req.method === 'POST') {
    const { name, role, color } = req.body
    if (!name) return res.status(400).json({ error: '请填写姓名' })

    // 检查是否已存在 member
    const existing = await findBy(KEYS.MEMBERS, 'user_id', user.id)
    if (existing) {
      return res.json({ success: true, data: existing })
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
