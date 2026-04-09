import { getUserMember } from '@/lib/helpers'
import { getAll, getAllBatch, updateById, removeById, addToList, KEYS, genId, findById } from '@/lib/db'

// 自动将成员设为忙碌（仅空闲时生效）
async function autoSetBusy(memberId) {
  const members = await getAll(KEYS.MEMBERS)
  const m = members.find(m => m.id === memberId)
  if (m && m.status === 'free') {
    await updateById(KEYS.MEMBERS, memberId, { status: 'busy' })
  }
}

// 完成工单时自动检查是否需要将成员设回空闲
async function autoSetFree(memberId) {
  if (!memberId) return
  const tickets = await getAll(KEYS.TICKETS)
  const hasInProgress = tickets.some(t => t.member_id === memberId && t.status === 'inprogress')
  if (!hasInProgress) {
    await updateById(KEYS.MEMBERS, memberId, { status: 'free' })
  }
}

export default async function handler(req, res) {
  const member = await getUserMember(req)
  if (!member) return res.status(401).json({ error: '未授权' })

  const { id } = req.query

  if (req.method === 'GET') {
    // pipeline 单次网络往返读取 ticket + members + logs
    const [tickets, members, logs] = await getAllBatch([KEYS.TICKETS, KEYS.MEMBERS, KEYS.LOGS])
    const ticket = tickets.find(t => t.id === id)
    if (!ticket) return res.status(404).json({ error: '工单不存在' })

    const m = members.find(m => m.id === ticket.member_id)
    const ticketLogs = logs.filter(l => l.ticket_id === id).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

    return res.json({
      success: true,
      data: {
        ...ticket,
        member: m ? { id: m.id, name: m.name, role: m.role, color: m.color } : null,
        logs: ticketLogs
      }
    })
  }

  if (req.method === 'PUT') {
    const updates = {}
    const fields = ['ticket_no', 'client', 'type', 'status', 'member_id', 'services', 'deadline', 'note', 'clinic_code', 'ticket_date']
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

    // 并行：自动状态管理 + 关联 member 查询（减少串行等待）
    const [, allMembers] = await Promise.all([
      // 自动状态管理
      (async () => {
        if (updates.status === 'done') {
          await autoSetFree(data.member_id)
        }
        if (updates.member_id && (updates.status === 'inprogress' || (!updates.status && data.status === 'inprogress'))) {
          await autoSetBusy(updates.member_id)
        }
      })(),
      // 关联 member
      getAll(KEYS.MEMBERS),
    ])
    const m = allMembers.find(m => m.id === data.member_id)

    return res.json({
      success: true,
      data: { ...data, member: m ? { id: m.id, name: m.name, role: m.role, color: m.color } : null }
    })
  }

  if (req.method === 'DELETE') {
    if (!member.is_admin) return res.status(403).json({ error: '仅组长可删除' })

    // 删除前获取工单的成员信息
    const ticket = await findById(KEYS.TICKETS, id)
    if (!ticket) return res.status(404).json({ error: '工单不存在' })

    const ok = await removeById(KEYS.TICKETS, id)
    if (!ok) return res.status(404).json({ error: '工单不存在' })

    // 删除后检查该成员是否还有进行中工单，没有则恢复空闲
    if (ticket.member_id && ticket.status === 'inprogress') {
      await autoSetFree(ticket.member_id)
    }

    return res.json({ success: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
