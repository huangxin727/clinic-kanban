import { supabaseAdmin } from '@/lib/supabase'
import { getUserMember } from '@/lib/helpers'

export default async function handler(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  const member = await getUserMember(supabaseAdmin, token)
  if (!member) return res.status(401).json({ error: '未授权' })

  if (req.method === 'GET') {
    const { member_id, type, status, date, search } = req.query
    
    let query = supabaseAdmin
      .from('tickets')
      .select('*, member:members(id, name, role, color)')
      .order('created_at', { ascending: false })

    // 权限过滤：组员只能看自己的，组长看全部
    if (!member.is_admin) {
      query = query.eq('member_id', member.id)
    } else if (member_id) {
      query = query.eq('member_id', member_id)
    }

    if (type) query = query.eq('type', type)
    if (status) query = query.eq('status', status)
    if (date) query = query.eq('ticket_date', date)
    if (search) {
      query = query.or(`client.ilike.%${search}%,ticket_no.ilike.%${search}%`)
    }

    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ success: true, data })
  }

  if (req.method === 'POST') {
    const { ticket_no, client, type, member_id, status, services, deadline, note } = req.body
    if (!client) return res.status(400).json({ error: '请填写客户名称' })

    const ticketDate = req.body.ticket_date || new Date().toISOString().split('T')[0]

    const { data, error } = await supabaseAdmin
      .from('tickets')
      .insert({
        ticket_no, client, type,
        status: status || 'inprogress',
        member_id: member_id || member.id,
        services: services || [],
        deadline, note, ticket_date: ticketDate
      })
      .select('*, member:members(id, name, role, color)')
      .single()

    if (error) return res.status(500).json({ error: error.message })

    // 如果有备注，同时创建日志
    if (note) {
      await supabaseAdmin
        .from('ticket_logs')
        .insert({ ticket_id: data.id, content: note })
    }

    return res.json({ success: true, data })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
