import { getUserMember } from '@/lib/helpers'
import { getAll, KEYS } from '@/lib/db'

export default async function handler(req, res) {
  const member = await getUserMember(req)
  if (!member) return res.status(401).json({ error: '未授权' })
  if (!member.is_admin) return res.status(403).json({ error: '仅组长可导出' })

  const date = req.query.date || new Date().toISOString().split('T')[0]

  const tickets = await getAll(KEYS.TICKETS)
  const allMembers = await getAll(KEYS.MEMBERS)
  const memberMap = {}
  allMembers.forEach(m => { memberMap[m.id] = m })

  const dateTickets = tickets
    .filter(t => t.ticket_date === date)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  const TYPE_MAP = { init: '数据初始化', training: '培训', insurance: '医保对接', followup: '跟进', other: '其他' }
  const STATUS_MAP = { pending: '待处理', inprogress: '进行中', done: '已完成', urgent: '需跟进' }

  const BOM = '\uFEFF'
  const header = '工单号,客户名称,类型,负责人,状态,服务进度,诊所编码,接单时间,备注\n'
  const rows = dateTickets.map(t =>
    [
      t.ticket_no || '',
      t.client || '',
      TYPE_MAP[t.type] || t.type,
      memberMap[t.member_id]?.name || '',
      STATUS_MAP[t.status] || t.status,
      (t.services || []).join('|'),
      t.clinic_code || '',
      t.created_at ? new Date(t.created_at).toLocaleString('zh-CN') : '',
      (t.note || '').replace(/,/g, '，').replace(/\n/g, ' ')
    ].join(',')
  ).join('\n')

  const csv = BOM + header + rows
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="工单日报_${date}.csv"`)
  res.send(csv)
}
