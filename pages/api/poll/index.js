import { getUserMember } from '@/lib/helpers'
import { getUpdateTs } from '@/lib/db'

/**
 * 轻量变更检测接口
 * 前端用 3s 间隔轮询此接口，检测到时间戳变化才触发全量刷新
 * 响应体极小（仅一个时间戳），几乎零带宽消耗
 */
export default async function handler(req, res) {
  try {
    const member = await getUserMember(req)
    if (!member) return res.status(401).json({ error: '未授权' })

    const ts = await getUpdateTs()
    return res.json({ success: true, ts: ts || '0' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
