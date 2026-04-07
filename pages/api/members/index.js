import { supabaseAdmin } from '@/lib/supabase'
import { ok, err, getUserMember } from '@/lib/helpers'

// 获取组员列表 / 添加组员
export default async function handler(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  const member = await getUserMember(supabaseAdmin, token)
  if (!member) return res.status(401).json({ error: '未授权' })

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('members')
      .select('*')
      .order('created_at', { ascending: true })
    
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ success: true, data })
  }

  if (req.method === 'POST') {
    if (!member.is_admin) return res.status(403).json({ error: '仅组长可操作' })
    
    const { name, role, status, color, email } = req.body
    if (!name) return res.status(400).json({ error: '请填写姓名' })

    // 如果提供了 email，查找 auth.users
    let userId = null
    if (email) {
      // 查询 Supabase auth.users 需要用 admin API，这里用一种变通方式：
      // 让用户通过前端注册后自动关联
      // 此处先创建 member，后续通过 profile 接口关联
    }

    const { data, error } = await supabaseAdmin
      .from('members')
      .insert({ name, role: role || '全能', status: status || 'free', color })
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.json({ success: true, data })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
