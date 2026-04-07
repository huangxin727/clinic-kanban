import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('请在 .env.local 中配置 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

// 服务端专用客户端（跳过 RLS，用于管理接口）
export const supabaseAdmin = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false }
})

// 客户端专用（使用用户 token）
export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey)
