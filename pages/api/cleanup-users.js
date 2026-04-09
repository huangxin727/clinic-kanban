// 一次性清理 API：清空所有非组长的 user 账号
// 用完即删

import { getAll, rewriteList, KEYS } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export default async function handler(req, res) {
  if (req.query.confirm !== 'CLEAN_USERS') {
    return res.json({ error: '缺少确认参数' })
  }

  try {
    const user = await getCurrentUser(req)
    if (!user) return res.status(401).json({ error: '未授权' })

    const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || '2505174169@qq.com'

    // 清理 users：只保留组长
    const users = await getAll(KEYS.USERS)
    const keptUsers = users.filter(u => u.email && u.email.toLowerCase() === adminEmail.toLowerCase())
    const removedUsers = users.filter(u => !u.email || u.email.toLowerCase() !== adminEmail.toLowerCase())
    await rewriteList(KEYS.USERS, keptUsers)

    // 同时清理 members：只保留组长
    const members = await getAll(KEYS.MEMBERS)
    const keptMembers = members.filter(m => m.is_admin)
    const removedMembers = members.filter(m => !m.is_admin)
    await rewriteList(KEYS.MEMBERS, keptMembers)

    // 清理所有工单和日志
    await rewriteList(KEYS.TICKETS, [])
    await rewriteList(KEYS.LOGS, [])

    res.json({
      success: true,
      message: '清理完成',
      removed: {
        users: removedUsers.map(u => u.email || u.id),
        members: removedMembers.map(m => m.name || m.id),
        tickets: '全部清空',
        logs: '全部清空',
      },
      kept: {
        users: keptUsers.map(u => u.email),
        members: keptMembers.map(m => m.name),
      }
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
