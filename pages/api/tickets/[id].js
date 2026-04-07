import { supabaseAdmin } from '@/lib/supabase'
import { getUserMember } from '@/lib/helpers'

export default async function handler(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  const member = await getUserMember(supabaseAdmin, token)
  if (!member) return res.status(401).json({ error: '未授权' })

  const { id } = req.query

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('tickets')
      .select('*, member:members(id, name, role, color), logs:ticket_logs(*)')
      .eq('id', id)
      .single()
    
    if (error) return res.status(404).json({ error: '工单不存在' })
    return res.json({ success: true, data })
  }

  if (req.method === 'PUT') {
    const updates = {}
    const fields = ['ticket_no', 'client', 'type', 'status', 'member_id', 'services', 'deadline', 'note']
    fields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f] })

    // 如果备注变更，追加日志
    if (req.body.note && req.body.note !== req.body._old_note) {
      await supabaseAdmin
        .from('ticket_logs')
        .insert({ ticket_id: id, content: req.body.note })
    }
    delete updates._old_note

    const { data, error } = await supabaseAdmin
      .from('tickets')
      .update(updates)
      .eq('id', id)
      .select('*, member:members(id, name, role, color)')
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.json({ success: true, data })
  }

  if (req.method === 'DELETE') {
    if (!member.is_admin) return res.status(403).json({ error: '仅组长可删除' })
    
    const { error } = await supabaseAdmin
      .from('tickets')
      .delete()
      .eq('id', id)

    if (error) return res.status(500).json({ error: error.message })
    return res.json({ success: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
