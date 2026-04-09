// 一次性清理 API（无鉴权版，用密钥保护）
// 用完即删

import { getAll, rewriteList, KEYS } from '@/lib/db'

export default async function handler(req, res) {
  if (req.query.key !== 'x2026clean') {
    return res.status(403).json({ error: '无效密钥' })
  }

  try {
    const adminEmail = '2505174169@qq.com'

    // 清理 users：只保留组长
    const users = await getAll(KEYS.USERS)
    const keptUsers = users.filter(u => u.email && u.email.toLowerCase() === adminEmail.toLowerCase())
    const removedUsers = users.filter(u => !u.email || u.email.toLowerCase() !== adminEmail.toLowerCase())
    await rewriteList(KEYS.USERS, keptUsers)

    // 清理 members：只保留组长
    const members = await getAll(KEYS.MEMBERS)
    const keptMembers = members.filter(m => m.is_admin)
    const removedMembers = members.filter(m => !m.is_admin)
    await rewriteList(KEYS.MEMBERS, keptMembers)

    // 清理工单和日志
    await rewriteList(KEYS.TICKETS, [])
    await rewriteList(KEYS.LOGS, [])

    res.json({
      success: true,
      removed_users: removedUsers.map(u => u.email || u.id),
      removed_members: removedMembers.map(m => m.name || m.id),
      kept_users: keptUsers.map(u => u.email),
      kept_members: keptMembers.map(m => m.name),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
