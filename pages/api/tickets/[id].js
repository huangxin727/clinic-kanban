import { getUserMember } from '@/lib/helpers'
import { getAll, updateById, removeById, addToList, KEYS, genId, findById } from '@/lib/db'

export default async function handler(req, res) {
  const member = await getUserMember(req)
  if (!member) return res.status(401).json({ error: '未授权' })

  const { id } = req.query

  if (req.method === 'GET') {
    const ticket = await findById(KEYS.TICKETS, id)
    if (!ticket) return res.status(404).json({ error: '工单不存在' })

    // 关联 member 和 logs
    const allMembers = await getAll(KEYS.MEMBERS)
    const m = allMembers.find(m => m.id === ticket.member_id)

    const allLogs = await getAll(KEYS.LOGS)
    const logs = allLogs.filter(l => l.ticket_id === id).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

    return res.json({
      success: true,
      data: {
        ...ticket,
        member: m ? { id: m.id, name: m.name, role: m.role, color: m.color } : null,
        logs
      }
    })
  }

  if (req.method === 'PUT') {
    const updates = {}
    const fields = ['ticket_no', 'client', 'type', 'status', 'member_id', 'services', 'deadline', 'note', 'clinic_code']
    fields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f] })

    // 如果备注变更，追加日志
    if (req.body.note && req.body.note !== req.body._old_note) {
      await addToList(KEYS.LOGS, {
        id: 'l_' + genId(),
        ticket_id: id,
        content: req.body.note,
        created_at: new Date().toISOString(),
      })
    }
    delete updates._old_note

    const data = await updateById(KEYS.TICKETS, id, updates)
    if (!data) return res.status(404).json({ error: '工单不存在' })

    // 关联 member
    const allMembers = await getAll(KEYS.MEMBERS)
    const m = allMembers.find(m => m.id === data.member_id)

    return res.json({
      success: true,
      data: { ...data, member: m ? { id: m.id, name: m.name, role: m.role, color: m.color } : null }
    })
  }

  if (req.method === 'DELETE') {
    if (!member.is_admin) return res.status(403).json({ error: '仅组长可删除' })

    const ok = await removeById(KEYS.TICKETS, id)
    if (!ok) return res.status(404).json({ error: '工单不存在' })
    return res.json({ success: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
