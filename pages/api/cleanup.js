import { getAll, getAllBatch, KEYS } from '@/lib/db'

// 一次性清理接口：保留组长账号，清空其他 users/members/tickets/logs
// 用完后应立即删除
export default async function handler(req, res) {
  // 简易验证
  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ error: '未授权' })

  // ⚠️ 确认参数
  if (req.query.confirm !== 'CLEAN_ALL') {
    return res.status(400).json({
      error: '请添加 ?confirm=CLEAN_ALL 参数确认清理',
      hint: '此操作将清空除组长外的所有数据（users、members、tickets、logs）',
    })
  }

  try {
    const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL
    const [members, users, tickets, logs] = await getAllBatch([
      KEYS.MEMBERS, KEYS.USERS, KEYS.TICKETS, KEYS.LOGS
    ])

    // 找到组长
    const adminMember = adminEmail
      ? members.find(m => m.email?.toLowerCase() === adminEmail.toLowerCase() || m.is_admin)
      : members.find(m => m.is_admin)

    const adminUser = adminEmail
      ? users.find(u => u.email?.toLowerCase() === adminEmail.toLowerCase())
      : null

    const result = {
      before: {
        members: members.length,
        users: users.length,
        tickets: tickets.length,
        logs: logs.length,
      },
      kept: {
        adminMember: adminMember ? { id: adminMember.id, name: adminMember.name, email: adminMember.email } : null,
        adminUser: adminUser ? { id: adminUser.id, email: adminUser.email } : null,
      },
    }

    if (!adminUser) {
      return res.status(400).json({
        error: '未找到组长用户账号，请确认 NEXT_PUBLIC_ADMIN_EMAIL 已配置',
        currentMembers: members.map(m => ({ id: m.id, name: m.name, email: m.email, is_admin: m.is_admin })),
        currentUsers: users.map(u => ({ id: u.id, email: u.email })),
      })
    }

    // 清空 tickets 和 logs
    const { Redis } = await import('@upstash/redis')
    const redis = new Redis({
      url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
    })
    await redis.del(KEYS.TICKETS)
    await redis.del(KEYS.LOGS)

    // 重写 users：只保留组长
    const { rewriteList } = await import('@/lib/db')
    // rewriteList 是私有函数，需要手动操作
    const pipeline = redis.pipeline()
    pipeline.del(KEYS.USERS)
    pipeline.rpush(KEYS.USERS, JSON.stringify(adminUser))
    pipeline.del(KEYS.MEMBERS)
    // 保留组长 member，确保补全 user_id 和 email
    if (adminMember) {
      const fixedAdmin = { ...adminMember, user_id: adminUser.id, email: adminUser.email, is_admin: true }
      pipeline.rpush(KEYS.MEMBERS, JSON.stringify(fixedAdmin))
    }
    await pipeline.exec()

    return res.json({
      success: true,
      message: '清理完成：仅保留组长账号，已清空所有工单、日志、其他成员和用户',
      ...result,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
