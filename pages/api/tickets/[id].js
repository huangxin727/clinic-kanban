import { getUserMember } from '@/lib/helpers'
import { getAll, updateById, removeById, addToList, KEYS, genId, findById, touchUpdate, tryAcquireAcceptLock, releaseAcceptLock } from '@/lib/db'

// 自动将成员设为忙碌（仅空闲时生效）
async function autoSetBusy(memberId) {
  const m = await findById(KEYS.MEMBERS, memberId)
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
    const [tickets, members, logs] = await Promise.all([
      getAll(KEYS.TICKETS),
      getAll(KEYS.MEMBERS),
      getAll(KEYS.LOGS),
    ])
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
    const fields = ['ticket_no', 'client', 'type', 'status', 'member_id', 'services', 'deadline', 'note', 'clinic_code', 'ticket_date', 'accepted_at']
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

    // 先查旧数据，判断是否需要记录完成时间
    const oldTicket = await findById(KEYS.TICKETS, id)

    // 接单幂等校验：用分布式锁 + 优先级抢占
    const isAccepting = updates.member_id && updates.status === 'inprogress'
    if (isAccepting) {
      if (oldTicket && oldTicket.member_id && oldTicket.member_id !== updates.member_id) {
        // 已被别人接走，尝试用优先级抢锁
        const lockResult = await tryAcquireAcceptLock(id, updates.member_id, member.is_admin)
        if (!lockResult.winner) {
          return res.status(409).json({ error: '该工单已被其他人接走' })
        }
      } else if (!oldTicket || !oldTicket.member_id) {
        // 工单未被接，走锁机制防并发
        const lockResult = await tryAcquireAcceptLock(id, updates.member_id, member.is_admin)
        if (!lockResult.winner) {
          return res.status(409).json({ error: '该工单已被其他人接走' })
        }
      }
    }

    // 只在状态从非done变为done时才记录完成时间（避免编辑已完成的工单覆盖原完成时间）
    if (updates.status === 'done' && (!oldTicket || oldTicket.status !== 'done') && !updates.completed_at) {
      updates.completed_at = new Date().toISOString()
    }

    const data = await updateById(KEYS.TICKETS, id, updates)
    if (!data) return res.status(404).json({ error: '工单不存在' })

    // 构造响应数据（不需要再次读 members，因为 member 信息在请求上下文中已有）
    const needBusy = updates.member_id && (updates.status === 'inprogress' || (!updates.status && data.status === 'inprogress'))
    const needFree = updates.status === 'done'

    // touchUpdate + 状态管理全部 fire-and-forget，不阻塞响应
    // 接单时用请求者自身的 member 信息构造响应
    const respMember = needBusy
      ? { id: member.id, name: member.name, role: member.role, color: member.color }
      : null

    // 后台任务：touchUpdate + autoSetBusy/SetFree（不阻塞响应）
    Promise.all([
      touchUpdate(),
      needBusy ? autoSetBusy(updates.member_id) : null,
      needFree ? autoSetFree(data.member_id) : null,
      isAccepting ? releaseAcceptLock(id) : null,
    ]).catch(err => console.error('后台任务失败:', err))

    // 对于接单场景，直接用请求者信息构造 member，不再等 getAll(MEMBERS)
    if (respMember) {
      return res.json({
        success: true,
        data: { ...data, member: updates.member_id === member.id ? respMember : null }
      })
    }

    // 其他场景仍需查询 member 信息
    const allMembers = await getAll(KEYS.MEMBERS)
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

    // 后台任务：touchUpdate + autoSetFree（不阻塞响应）
    const memberId = ticket.member_id && ticket.status === 'inprogress' ? ticket.member_id : null
    Promise.all([
      touchUpdate(),
      memberId ? autoSetFree(memberId) : null,
    ]).catch(err => console.error('后台任务失败:', err))

    return res.json({ success: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
