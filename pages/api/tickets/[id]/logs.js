import { supabaseAdmin } from '@/lib/supabase'
import { getUserMember } from '@/lib/helpers'

// 工单日志追加接口
export default async function handler(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  const member = await getUserMember(supabaseAdmin, token)
  if (!member) return res.status(401).json({ error: '未授权' })

  const { id } = req.query

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('ticket_logs')
      .select('*')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true })
    
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ success: true, data })
  }

  if (req.method === 'POST') {
    const { content } = req.body
    if (!content?.trim()) return res.status(400).json({ error: '请填写日志内容' })

    const { data, error } = await supabaseAdmin
      .from('ticket_logs')
      .insert({ ticket_id: id, content: content.trim() })
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.json({ success: true, data })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
