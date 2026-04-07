// 通用 API 响应辅助
export function ok(data) {
  return { status: 200, json: () => ({ success: true, data }) }
}

export function err(msg, status = 400) {
  return { status, json: () => ({ success: false, error: msg }) }
}

// 验证用户身份，返回 member 信息
export async function getUserMember(supabase, token) {
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null

  const { data: member } = await supabase
    .from('members')
    .select('*')
    .eq('user_id', user.id)
    .single()

  return member || null
}
