import { supabaseAdmin } from '@/lib/supabase'

// 获取/更新当前用户的 member profile
// 组长也可以为组员设置 profile
export default async function handler(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: '未授权' })

  if (req.method === 'GET') {
    const { data: member } = await supabaseAdmin
      .from('members')
      .select('*')
      .eq('user_id', user.id)
      .single()

    return res.json({
      success: true,
      data: member || null,
      email: user.email
    })
  }

  if (req.method === 'POST') {
    // 自动创建 profile（注册后首次调用）
    const { name, role, color } = req.body
    if (!name) return res.status(400).json({ error: '请填写姓名' })

    // 检查是否已存在
    const { data: existing } = await supabaseAdmin
      .from('members')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (existing) {
      return res.status(400).json({ error: 'Profile 已存在' })
    }

    // 检查是否是管理员邮箱
    const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL
    const isAdmin = adminEmail && user.email?.toLowerCase() === adminEmail.toLowerCase()

    const { data, error } = await supabaseAdmin
      .from('members')
      .insert({
        user_id: user.id,
        name,
        role: role || '全能',
        color: color || '#2563eb',
        is_admin: isAdmin,
        status: 'free'
      })
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.json({ success: true, data })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
