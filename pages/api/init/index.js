import { getUserMember } from '@/lib/helpers'
import { getAllBatch, findBy, KEYS } from '@/lib/db'

/**
 * 聚合初始化接口 - 一次请求返回所有数据
 * 使用 getAllBatch pipeline 单次网络往返读取所有 key
 */
export default async function handler(req, res) {
  const member = await getUserMember(req)
  if (!member) return res.status(401).json({ error: '未授权' })

  // 解析查询参数
  const date = req.query.date || new Date().toISOString().split('T')[0]
  const tzOffset = parseInt(req.query.tz, 10) || 0

  // pipeline 单次网络往返读取所有数据（1次 HTTP 请求代替 4 次）
  const [tickets, members, logs, settingsArr] = await getAllBatch([
    KEYS.TICKETS, KEYS.MEMBERS, KEYS.LOGS, 'kanban:settings'
  ])

  // 排序 members
  members.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  // 构建 member map
  const memberMap = {}
  members.forEach(m => { memberMap[m.id] = m })

  // 关联 member 到 tickets
  const enrichedTickets = tickets.map(t => ({
    ...t,
    member: memberMap[t.member_id] ? { id: memberMap[t.member_id].id, name: memberMap[t.member_id].name, role: memberMap[t.member_id].role, color: memberMap[t.member_id].color } : null
  })).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  // 过滤今日工单（兼容旧数据）
  const dateTickets = tickets.filter(t => {
    if (t.ticket_date) return t.ticket_date === date
    if (t.created_at) {
      const d = new Date(t.created_at)
      const local = new Date(d.getTime() + tzOffset * 3600000)
      const localStr = `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}`
      return localStr === date
    }
    return false
  })

  // 成员今日工单统计
  const memberStats = members.map(m => ({
    ...m,
    tickets: dateTickets.filter(t => t.member_id === m.id)
  }))

  // 今日统计
  const stats = {
    total: dateTickets.length,
    inprogress: dateTickets.filter(t => t.status === 'inprogress').length,
    done: dateTickets.filter(t => t.status === 'done').length,
    urgent: dateTickets.filter(t => t.status === 'urgent').length,
  }

  // settings（兼容旧数据：无 settings 时返回默认值）
  let settings = settingsArr.find(s => s.id === 'default') || {
    id: 'default',
    types: [
      { id: 'init', label: '数据初始化', service: '数据初始化', cls: 'tag-init' },
      { id: 'training', label: '培训', service: '系统培训', cls: 'tag-training' },
      { id: 'insurance', label: '医保对接', service: '医保对接', cls: 'tag-insurance' },
      { id: 'followup', label: '跟进', service: '上线验收', cls: 'tag-followup' },
      { id: 'other', label: '其他', service: '', cls: 'tag-other' },
    ],
    services: ['数据初始化', '医保对接', '系统培训', '上线验收'],
  }

  return res.json({
    success: true,
    data: {
      tickets: enrichedTickets,
      members,
      memberStats,
      stats,
      settings,
    }
  })
}
