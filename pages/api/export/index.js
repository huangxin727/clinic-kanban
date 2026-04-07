import { supabaseAdmin } from '@/lib/supabase'
import { getUserMember } from '@/lib/helpers'

export default async function handler(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  const member = await getUserMember(supabaseAdmin, token)
  if (!member) return res.status(401).json({ error: '未授权' })

  if (!member.is_admin) return res.status(403).json({ error: '仅组长可导出' })

  const date = req.query.date || new Date().toISOString().split('T')[0]

  const { data: tickets, error } = await supabaseAdmin
    .from('tickets')
    .select('*, member:members(name)')
    .eq('ticket_date', date)
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  const TYPE_MAP = { init: '数据初始化', training: '培训', insurance: '医保对接', followup: '跟进', other: '其他' }
  const STATUS_MAP = { pending: '待处理', inprogress: '进行中', done: '已完成', urgent: '需跟进' }

  const BOM = '\uFEFF'
  const header = '工单号,客户名称,类型,负责人,状态,服务进度,接单时间,备注\n'
  const rows = (tickets || []).map(t =>
    [
      t.ticket_no || '',
      t.client || '',
      TYPE_MAP[t.type] || t.type,
      t.member?.name || '',
      STATUS_MAP[t.status] || t.status,
      (t.services || []).join('|'),
      t.created_at ? new Date(t.created_at).toLocaleString('zh-CN') : '',
      (t.note || '').replace(/,/g, '，').replace(/\n/g, ' ')
    ].join(',')
  ).join('\n')

  const csv = BOM + header + rows
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="工单日报_${date}.csv"`)
  res.send(csv)
}
