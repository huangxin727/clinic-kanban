import { supabaseAdmin } from '@/lib/supabase'

export default async function handler(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return res.status(401).json({ error: '未授权' })

  const { id } = req.query

  if (req.method === 'PUT') {
    const updates = {}
    if (req.body.name) updates.name = req.body.name
    if (req.body.role) updates.role = req.body.role
    if (req.body.status) updates.status = req.body.status
    if (req.body.color) updates.color = req.body.color

    const { data, error } = await supabaseAdmin
      .from('members')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.json({ success: true, data })
  }

  if (req.method === 'DELETE') {
    // 检查是否是管理员
    const { data: me } = await supabaseAdmin
      .from('members')
      .select('is_admin')
      .eq('user_id', user.id)
      .single()
    
    if (!me?.is_admin) return res.status(403).json({ error: '仅组长可删除' })

    const { error } = await supabaseAdmin
      .from('members')
      .delete()
      .eq('id', id)

    if (error) return res.status(500).json({ error: error.message })
    return res.json({ success: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
