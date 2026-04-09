import { getUser } from '@/lib/helpers'
import { findBy, updateById, KEYS, addToList } from '@/lib/db'

export default async function handler(req, res) {
  // 先验证用户身份
  const user = await getUser(req)
  if (!user) return res.status(401).json({ error: '未授权' })

  if (req.method === 'GET') {
    // 先按 user_id 查找（新流程创建的成员）
    let member = await findBy(KEYS.MEMBERS, 'user_id', user.id)

    // 兼容旧数据：按 email 查找，并自动补上 user_id
    if (!member && user.email) {
      const { getAll } = await import('@/lib/db')
      const allMembers = await getAll(KEYS.MEMBERS)
      member = allMembers.find(m => m.email?.toLowerCase() === user.email.toLowerCase())
      if (member && !member.user_id) {
        // 自动补关联
        await updateById(KEYS.MEMBERS, member.id, { user_id: user.id })
        member.user_id = user.id
      }
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
