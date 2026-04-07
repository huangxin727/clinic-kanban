import { getUserMember } from '@/lib/helpers'
import { getAll, KEYS } from '@/lib/db'

export default async function handler(req, res) {
  const member = await getUserMember(req)
  if (!member) return res.status(401).json({ error: '未授权' })

  const date = req.query.date || new Date().toISOString().split('T')[0]
  const tzOffset = parseInt(req.query.tz, 10) || 0

  const tickets = await getAll(KEYS.TICKETS)
  const dateTickets = tickets.filter(t => {
    if (t.ticket_date) return t.ticket_date === date
    // 兼容旧数据：无 ticket_date 时用 created_at 转为用户本地时区的日期
    if (t.created_at) {
      const d = new Date(t.created_at)
      // 加上时区偏移得到用户本地时间
      const local = new Date(d.getTime() + tzOffset * 3600000)
      const localStr = `${local.getUTCFullYear()}-${String(local.getUTCMonth()+1).padStart(2,'0')}-${String(local.getUTCDate()).padStart(2,'0')}`
      return localStr === date
    }
    return false
  })

  const members = await getAll(KEYS.MEMBERS)
  members.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  const memberStats = members.map(m => ({
    ...m,
    tickets: dateTickets.filter(t => t.member_id === m.id)
  }))

  return res.json({
    success: true,
    data: {
      total: dateTickets.length,
      inprogress: dateTickets.filter(t => t.status === 'inprogress').length,
      done: dateTickets.filter(t => t.status === 'done').length,
      urgent: dateTickets.filter(t => t.status === 'urgent').length,
      memberStats,
      date
    }
  })
}
