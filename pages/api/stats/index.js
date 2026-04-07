import { supabaseAdmin } from '@/lib/supabase'
import { getUserMember } from '@/lib/helpers'

export default async function handler(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  const member = await getUserMember(supabaseAdmin, token)
  if (!member) return res.status(401).json({ error: '未授权' })

  const date = req.query.date || new Date().toISOString().split('T')[0]

  if (!member.is_admin) {
    // 普通组员：只返回自己的统计
    const { count: total } = await supabaseAdmin
      .from('tickets').select('*', { count: 'exact', head: true })
      .eq('member_id', member.id).eq('ticket_date', date)

    const { count: inprogress } = await supabaseAdmin
      .from('tickets').select('*', { count: 'exact', head: true })
      .eq('member_id', member.id).eq('ticket_date', date).eq('status', 'inprogress')

    const { count: done } = await supabaseAdmin
      .from('tickets').select('*', { count: 'exact', head: true })
      .eq('member_id', member.id).eq('ticket_date', date).eq('status', 'done')

    const { count: urgent } = await supabaseAdmin
      .from('tickets').select('*', { count: 'exact', head: true })
      .eq('member_id', member.id).eq('ticket_date', date).eq('status', 'urgent')

    return res.json({ success: true, data: { total, inprogress, done, urgent } })
  }

  // 组长：返回全局统计 + 每人统计
  const { count: total } = await supabaseAdmin
    .from('tickets').select('*', { count: 'exact', head: true }).eq('ticket_date', date)
  const { count: inprogress } = await supabaseAdmin
    .from('tickets').select('*', { count: 'exact', head: true }).eq('ticket_date', date).eq('status', 'inprogress')
  const { count: done } = await supabaseAdmin
    .from('tickets').select('*', { count: 'exact', head: true }).eq('ticket_date', date).eq('status', 'done')
  const { count: urgent } = await supabaseAdmin
    .from('tickets').select('*', { count: 'exact', head: true }).eq('ticket_date', date).eq('status', 'urgent')

  // 每人今日工单分布
  const { data: members } = await supabaseAdmin
    .from('members').select('*').order('created_at')

  const memberStats = []
  for (const m of members) {
    const { data: tickets } = await supabaseAdmin
      .from('tickets')
      .select('id, type, status')
      .eq('member_id', m.id)
      .eq('ticket_date', date)

    memberStats.push({ ...m, tickets: tickets || [] })
  }

  return res.json({
    success: true,
    data: { total, inprogress, done, urgent, memberStats, date }
  })
}
