import { getUserMember } from '@/lib/helpers'
import { getAll, addToList, updateById, KEYS, genId, filterBy, findById } from '@/lib/db'

// 自动将成员设为忙碌（仅空闲时生效）
async function autoSetBusy(memberId) {
  const members = await getAll(KEYS.MEMBERS)
  const m = members.find(m => m.id === memberId)
  if (m && m.status === 'free') {
    await updateById(KEYS.MEMBERS, memberId, { status: 'busy' })
  }
}

export default async function handler(req, res) {
  const member = await getUserMember(req)
  if (!member) return res.status(401).json({ error: '未授权' })

  if (req.method === 'GET') {
    const { member_id, type, status, date, search } = req.query

    let tickets = await getAll(KEYS.TICKETS)

    // 所有人都能查看全部工单，组长可以按 member_id 筛选
    if (member_id) {
      tickets = tickets.filter(t => t.member_id === member_id)
    }

    if (type) tickets = tickets.filter(t => t.type === type)
    if (status) tickets = tickets.filter(t => t.status === status)
    if (date) tickets = tickets.filter(t => t.ticket_date === date)
    if (search) {
      const s = search.toLowerCase()
      tickets = tickets.filter(t =>
        (t.client || '').toLowerCase().includes(s) ||
        (t.ticket_no || '').toLowerCase().includes(s)
      )
    }

    // 按创建时间降序
    tickets.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    // 关联 member 信息
    const allMembers = await getAll(KEYS.MEMBERS)
    const memberMap = {}
    allMembers.forEach(m => { memberMap[m.id] = m })

    const enriched = tickets.map(t => ({
      ...t,
      member: memberMap[t.member_id] ? { id: memberMap[t.member_id].id, name: memberMap[t.member_id].name, role: memberMap[t.member_id].role, color: memberMap[t.member_id].color } : null
    }))

    return res.json({ success: true, data: enriched })
  }

  if (req.method === 'POST') {
    const { ticket_no, client, type, member_id, status, services, deadline, note, clinic_code } = req.body
    if (!client) return res.status(400).json({ error: '请填写客户名称' })

    const ticketDate = req.body.ticket_date || new Date().toISOString().split('T')[0]

    const ticket = {
      id: 't_' + genId(),
      ticket_no,
      client,
      type,
      status: status || 'inprogress',
      member_id: member_id || member.id,
      services: services || [],
      deadline,
      note,
      clinic_code: clinic_code || '',
      ticket_date: ticketDate,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    await addToList(KEYS.TICKETS, ticket)

    // 接单时自动将成员状态改为忙碌（如果是空闲状态）
    if (ticket.member_id && ticket.status === 'inprogress') {
      await autoSetBusy(ticket.member_id)
    }

    // 如果有备注，同时创建日志
    if (note) {
      await addToList(KEYS.LOGS, {
        id: 'l_' + genId(),
        ticket_id: ticket.id,
        content: note,
        created_at: new Date().toISOString(),
      })
    }

    // 返回关联 member 信息
    const allMembers = await getAll(KEYS.MEMBERS)
    const m = allMembers.find(m => m.id === ticket.member_id)
    const enriched = {
      ...ticket,
      member: m ? { id: m.id, name: m.name, role: m.role, color: m.color } : null
    }

    return res.json({ success: true, data: enriched })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
