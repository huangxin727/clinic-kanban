// 一次性调试 API：查看 Redis 当前数据
import { getAll, KEYS } from '@/lib/db'

export default async function handler(req, res) {
  if (req.query.key !== 'debug2026') return res.status(403).json({ error: 'forbidden' })

  try {
    const [users, members, tickets, logs] = await Promise.all([
      getAll(KEYS.USERS),
      getAll(KEYS.MEMBERS),
      getAll(KEYS.TICKETS),
      getAll(KEYS.LOGS),
    ])

    res.json({ users, members, tickets_count: tickets.length, logs_count: logs.length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
