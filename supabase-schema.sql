-- ============================================================
-- 实施工单看板 - Supabase 数据库建表脚本
-- 在 Supabase 控制台 → SQL Editor 中执行
-- ============================================================

-- 1. 组员表
CREATE TABLE members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT DEFAULT '全能',        -- 全能 / 数据导入 / 培训 / 医保对接
  status TEXT DEFAULT 'free',     -- free / busy / offline
  color TEXT DEFAULT '#2563eb',
  is_admin BOOLEAN DEFAULT FALSE,  -- 组长标识
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 工单表
CREATE TABLE tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_no TEXT,                  -- 七鱼工单号
  client TEXT NOT NULL,            -- 客户/诊所名称
  type TEXT NOT NULL,              -- init / training / insurance / followup / other
  status TEXT DEFAULT 'pending',   -- pending / inprogress / done / urgent
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  services TEXT[] DEFAULT '{}',    -- 已完成的服务: ['数据初始化','医保对接','系统培训','上线验收']
  deadline DATE,                   -- 预计完成日期
  note TEXT,                       -- 最新备注
  ticket_date DATE DEFAULT CURRENT_DATE,  -- 所属日期
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 工作日志表（每条工单可追加多条记录）
CREATE TABLE ticket_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 自动更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tickets_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Row Level Security (RLS) 策略
-- ============================================================

-- 组员表：只有管理员可以增删改，所有人可读
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "组员_所有登录用户可读"
  ON members FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "组员_管理员可增删改"
  ON members FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM members WHERE user_id = auth.uid() AND is_admin = true)
  );

-- 工单表：组员只能看自己的，组长能看全部
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "工单_查看自己的工单"
  ON tickets FOR SELECT
  TO authenticated
  USING (
    member_id IN (SELECT id FROM members WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM members WHERE user_id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "工单_组长可增删改全部"
  ON tickets FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM members WHERE user_id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "工单_组员可修改自己的工单"
  ON tickets FOR UPDATE
  TO authenticated
  USING (
    member_id IN (SELECT id FROM members WHERE user_id = auth.uid())
  );

-- 日志表：同工单策略
ALTER TABLE ticket_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "日志_查看自己工单的日志"
  ON ticket_logs FOR SELECT
  TO authenticated
  USING (
    ticket_id IN (
      SELECT id FROM tickets
      WHERE member_id IN (SELECT id FROM members WHERE user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM members WHERE user_id = auth.uid() AND is_admin = true)
    )
  );

CREATE POLICY "日志_可为自己工单添加日志"
  ON ticket_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    ticket_id IN (
      SELECT id FROM tickets
      WHERE member_id IN (SELECT id FROM members WHERE user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM members WHERE user_id = auth.uid() AND is_admin = true)
    )
  );

-- ============================================================
-- 索引优化
-- ============================================================
CREATE INDEX idx_tickets_member ON tickets(member_id);
CREATE INDEX idx_tickets_date ON tickets(ticket_date);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_logs_ticket ON ticket_logs(ticket_id);
CREATE INDEX idx_members_user ON members(user_id);
