import { getUserMember } from '@/lib/helpers'
import { getAll, KEYS } from '@/lib/db'

export default async function handler(req, res) {
  const member = await getUserMember(req)
  if (!member) return res.status(401).json({ error: '未授权' })

  const date = req.query.date || new Date().toISOString().split('T')[0]

  if (!member.is_admin) {
    // 普通组员：只返回自己的统计
    const tickets = await getAll(KEYS.TICKETS)
    const myTickets = tickets.filter(t => t.member_id === member.id && t.ticket_date === date)

    return res.json({
      success: true,
      data: {
        total: myTickets.length,
        inprogress: myTickets.filter(t => t.status === 'inprogress').length,
        done: myTickets.filter(t => t.status === 'done').length,
        urgent: myTickets.filter(t => t.status === 'urgent').length,
      }
    })
  }

  // 组长：返回全局统计 + 每人统计
  const tickets = await getAll(KEYS.TICKETS)
  const dateTickets = tickets.filter(t => t.ticket_date === date)

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
