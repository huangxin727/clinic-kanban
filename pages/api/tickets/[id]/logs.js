import { cachedHandler, getUserMember } from '@/lib/helpers'
import { getAll, addToList, KEYS, genId, filterBy } from '@/lib/db'

export default cachedHandler(async function handler(req, res) {
  const member = await getUserMember(req)
  if (!member) return res.status(401).json({ error: '未授权' })

  const { id } = req.query

  if (req.method === 'GET') {
    const allLogs = await getAll(KEYS.LOGS)
    const logs = allLogs.filter(l => l.ticket_id === id).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    return res.json({ success: true, data: logs })
  }

  if (req.method === 'POST') {
    const { content } = req.body
    if (!content?.trim()) return res.status(400).json({ error: '请填写日志内容' })

    const log = {
      id: 'l_' + genId(),
      ticket_id: id,
      content: content.trim(),
      created_at: new Date().toISOString(),
    }
    await addToList(KEYS.LOGS, log)
    return res.json({ success: true, data: log })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
