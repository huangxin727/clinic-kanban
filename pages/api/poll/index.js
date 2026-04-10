import { verifyToken } from '@/lib/auth'
import { getAll, getUpdateTs, KEYS } from '@/lib/db'

/**
 * 轻量变更检测 + 增量数据接口
 * 前端用 1s 间隔轮询此接口
 * 检测到时间戳变化时，直接返回最新 tickets + members（局部更新，避免全量 refreshAll）
 * 跳过 getUserMember（需多次 Redis 往返），直接用 JWT 本地验证 + member 关联
 */
export default async function handler(req, res) {
  try {
    // JWT 本地验证（0 成本，无需 Redis）
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: '未授权' })
    const payload = await verifyToken(token)
    if (!payload) return res.status(401).json({ error: '未授权' })

    const ts = await getUpdateTs()

    // 只在有变更时才拉取数据
    const clientTs = req.query.ts || '0'
    if (ts && ts !== clientTs) {
      // 并行只读 tickets + members（2次 Redis LRANGE）
      const [tickets, members] = await Promise.all([
        getAll(KEYS.TICKETS),
        getAll(KEYS.MEMBERS),
      ])

      // 关联 member 信息
      const memberMap = {}
      members.forEach(m => { memberMap[m.id] = m })

      const enrichedTickets = tickets.map(t => ({
        ...t,
        member: memberMap[t.member_id]
          ? { id: memberMap[t.member_id].id, name: memberMap[t.member_id].name, role: memberMap[t.member_id].role, color: memberMap[t.member_id].color }
          : null
      })).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

      return res.json({
        success: true,
        ts: ts || '0',
        changed: true,
        tickets: enrichedTickets,
        members,
      })
    }

    return res.json({ success: true, ts: ts || '0', changed: false })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
