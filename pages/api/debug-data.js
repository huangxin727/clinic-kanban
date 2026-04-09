// 调试 getUserMember 逻辑
import { getAll, findBy, updateById, KEYS } from '@/lib/db'

export default async function handler(req, res) {
  if (req.query.key !== 'debug2026') return res.status(403).json({ error: 'forbidden' })

  try {
    const users = await getAll(KEYS.USERS)
    const members = await getAll(KEYS.MEMBERS)
    const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || '2505174169@qq.com'

    // 模拟 getUserMember 对组长的查找过程
    const adminUser = users.find(u => u.email && u.email.toLowerCase() === adminEmail.toLowerCase())
    
    let step1 = null, step2 = null, step3 = null
    
    // Step 1: 按 user_id 查找
    if (adminUser) {
      step1 = members.find(m => m.user_id === adminUser.id)
    }
    
    // Step 2: 按 email 查找
    if (!step1 && adminUser) {
      step2 = members.find(m => m.email?.toLowerCase() === adminUser.email.toLowerCase())
    }
    
    // Step 3: 管理员邮箱兜底
    if (!step2 && adminUser) {
      const allMembers = await getAll(KEYS.MEMBERS)
      step3 = allMembers.find(m => m.is_admin && !m.user_id)
    }

    res.json({
      adminEmail,
      adminUser: adminUser ? { id: adminUser.id, email: adminUser.email } : null,
      allMembers: members.map(m => ({ id: m.id, name: m.name, user_id: m.user_id, email: m.email, is_admin: m.is_admin })),
      step1_byUserId: step1 ? { id: step1.id, name: step1.name } : null,
      step2_byEmail: step2 ? { id: step2.id, name: step2.name } : null,
      step3_adminFallback: step3 ? { id: step3.id, name: step3.name } : null,
      finalResult: step1 || step2 || step3 ? 'FOUND' : 'NOT_FOUND',
    })
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack })
  }
}
