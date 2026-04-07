# 实施工单看板 · 部署指南

> 技术栈：Next.js + Supabase + Vercel
> 全部免费，无需服务器，30分钟内完成部署

---

## 第一步：创建 Supabase 项目（5分钟）

1. 打开 https://supabase.com → 点击 **Start your project**
2. 注册/登录（可以用 GitHub 账号）
3. 点击 **New Project**
4. 填写：
   - **Name**: `clinic-kanban`
   - **Database Password**: 自己设一个密码（记住它，后面不会用到）
   - **Region**: 选 **Northeast Asia (Tokyo)** 或 **Southeast Asia (Singapore)** 速度最快
5. 等待创建完成（约2分钟）

---

## 第二步：建数据库表（2分钟）

1. 进入 Supabase 控制台，左侧点击 **SQL Editor**
2. 点击 **New Query**
3. 把 `supabase-schema.sql` 文件的**全部内容**粘贴进去
4. 点击 **Run** 执行
5. 看到 "Success" 就完成了

---

## 第三步：配置 Auth（允许邮箱注册）

1. 左侧点击 **Authentication** → **Providers**
2. 确保 **Email** 是启用的
3. （可选）如果想关闭邮箱确认，点击 **Settings**，把 **Email Confirm** 关掉，方便快速注册

---

## 第四步：获取 API 密钥

1. 左侧点击 **Settings** → **API**
2. 复制两个值：
   - **Project URL**（形如 `https://xxxxx.supabase.co`）
   - **Project API keys** → **anon public**（一段长字符串）

---

## 第五步：配置项目环境变量

在项目根目录创建 `.env.local` 文件，内容如下：

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的anon-key
NEXT_PUBLIC_ADMIN_EMAIL=你的组长邮箱@example.com
```

> 把 `xxxxx` 和 `你的anon-key` 替换为第三步获取的值
> `NEXT_PUBLIC_ADMIN_EMAIL` 填写**你自己的邮箱**，这个邮箱注册后自动成为组长

---

## 第六步：本地运行测试

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器
npm run dev

# 3. 打开浏览器访问
# http://localhost:3000
```

**首次使用流程：**
1. 打开页面会跳转到登录页
2. 先用**组长邮箱**注册 → 自动成为组长（管理员）
3. 登录后填写姓名 → 进入看板
4. 让其他组员也注册各自的账号
5. 组长可以在「组员列表」里添加组员（填写姓名、角色等信息）

---

## 第七步：部署到 Vercel（5分钟）

1. 打开 https://vercel.com → 用 GitHub 登录
2. 点击 **Add New** → **Project**
3. 上传项目文件夹 `kanban-app` 到 GitHub 仓库（或直接拖拽上传）
4. 在 Vercel 中导入该仓库
5. 在 **Environment Variables** 中添加：
   - `NEXT_PUBLIC_SUPABASE_URL` = 你的 Supabase URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = 你的 anon key
   - `NEXT_PUBLIC_ADMIN_EMAIL` = 组长邮箱
6. 点击 **Deploy**
7. 等待2分钟，部署完成后 Vercel 会给你一个访问地址（形如 `https://clinic-kanban.vercel.app`）

---

## 第八步：分享给团队

把 Vercel 给你的访问地址发给团队成员：
1. 每个人打开链接，用自己邮箱注册
2. 首次登录填写姓名 → 即可使用
3. 组长能看所有人的工单，组员只能看自己的

---

## 权限说明

| 角色 | 能力 |
|------|------|
| **组长（管理员）** | 查看全部工单、新增/编辑/删除工单、添加/移除组员、导出日报、查看全员统计 |
| **普通组员** | 只看自己的工单、编辑自己的工单、追加工作日志 |

---

## 费用说明

| 服务 | 免费额度 | 是否够用 |
|------|---------|---------|
| **Vercel** | 100GB带宽/月，无限站点 | ✅ 远远够用 |
| **Supabase** | 500MB数据库，5GB带宽/月，50000月活用户 | ✅ 20人团队绰绰有余 |
| **合计** | **¥0/月** | ✅ |

---

## 常见问题

**Q: 组员注册后看不到别人的工单？**
A: 这是正常的权限设计。组员只能看自己的工单，组长能看到所有人的。如果某个组员也需要看全部，可以让组长在数据库里把他的 `is_admin` 改为 `true`。

**Q: 如何修改组长权限？**
A: 在 Supabase 控制台 → Table Editor → members 表，找到对应成员，把 `is_admin` 字段改为 `true`。

**Q: 数据会丢失吗？**
A: 数据存在 Supabase 的云数据库中，不会因为浏览器关闭而丢失。Supabase 有自动备份功能（Pro 版），免费版建议定期导出。

**Q: 能绑定七鱼工单系统吗？**
A: 目前需要手动输入七鱼工单号来关联。如果后续需要深度集成，可以通过七鱼的开放 API 实现自动同步。

---

## 文件结构

```
kanban-app/
├── pages/
│   ├── _app.js              # App 入口
│   ├── _document.js         # HTML 文档
│   ├── index.js             # 主看板页面
│   ├── login.js             # 登录/注册页面
│   └── api/
│       ├── auth/profile.js  # 用户 Profile 接口
│       ├── members/
│       │   ├── index.js     # 组员列表/添加
│       │   └── [id].js      # 组员编辑/删除
│       ├── tickets/
│       │   ├── index.js     # 工单列表/新建
│       │   └── [id]/
│       │       ├── index.js # 工单编辑/删除
│       │       └── logs.js  # 工作日志
│       ├── stats/index.js   # 统计数据
│       └── export/index.js  # CSV 导出
├── lib/
│   ├── supabase.js          # Supabase 客户端
│   ├── client.js            # 前端 Supabase + API 封装
│   └── helpers.js           # 后端辅助函数
├── styles/globals.css       # 全局样式
├── supabase-schema.sql      # 数据库建表脚本
├── package.json
├── next.config.js
└── .env.local.example       # 环境变量模板
```
