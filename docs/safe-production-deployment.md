# 安全的生产环境部署流程

## 🚨 数据库安全第一原则

**永远不要在生产环境使用会清空数据的命令！**

### ❌ 危险命令（禁止在生产环境使用）

```bash
# ❌ 这些命令会清空所有数据！
prisma migrate reset      # 重置数据库，删除所有数据
prisma db push            # 可能导致数据丢失
prisma migrate dev        # 开发环境命令，可能重置数据
```

### ✅ 安全命令（生产环境使用）

```bash
# ✅ 这些命令安全，不会丢失数据
prisma generate           # 生成 Prisma Client
prisma migrate deploy     # 部署迁移，保留所有数据
prisma studio             # 查看数据（只读）
```

---

## 🎯 标准部署流程

### 步骤 1：本地开发环境修改 Schema

```bash
# 1. 修改 prisma/schema.prisma 文件
# 例如：添加新字段、新表等

# 2. 创建迁移文件（自动生成 SQL）
pnpm prisma:migrate:dev --name add_user_avatar

# 这会做三件事：
# - 在 prisma/migrations/ 创建新的迁移文件
# - 应用到本地数据库
# - 重新生成 Prisma Client
```

### 步骤 2：提交迁移文件到 Git

```bash
# 检查生成的迁移文件
git status

# 应该看到类似这样的文件：
# prisma/migrations/20260108120000_add_user_avatar/migration.sql

# 提交迁移文件
git add prisma/migrations
git commit -m "feat: add user avatar field"
```

### 步骤 3：部署到生产环境

#### 方式 A：Vercel 自动部署（推荐）

```bash
# 1. 推送代码到 GitHub
git push origin main

# 2. Vercel 会自动：
#    - 运行 prisma generate
#    - 运行 prisma migrate deploy（安全！）
#    - 构建应用
```

**关键配置**：确保 Vercel 环境变量中有 `DIRECT_URL`

```env
# Vercel Environment Variables
DATABASE_URL=postgresql://...pooler.supabase.com:6543/...?pgbouncer=true
DIRECT_URL=postgresql://...supabase.co:5432/...  # ← 必须配置这个！
```

#### 方式 B：手动部署到生产数据库

```bash
# 1. 设置生产数据库连接（使用 Direct Connection）
export DATABASE_URL="你的生产数据库 Direct URL"

# 2. 运行迁移
pnpm prisma:migrate:deploy

# 3. 验证
pnpm prisma:studio
```

---

## 📊 迁移管理最佳实践

### 1. 迁移文件命名规范

```bash
# 使用描述性的名称
pnpm prisma:migrate:dev --name add_user_avatar
pnpm prisma:migrate:dev --name create_orders_table
pnpm prisma:migrate:dev --name add_deleted_at_to_posts

# 避免模糊的名称
pnpm prisma:migrate:dev --name update    # ❌ 太模糊
pnpm prisma:migrate:dev --name migration # ❌ 没有意义
```

### 2. 迁移前的检查清单

- [ ] 已在本地测试过迁移
- [ ] 迁移文件已提交到 Git
- [ ] 生产数据库已备份（Supabase Dashboard → Backups）
- [ ] 确认使用 `migrate deploy` 而不是 `db push`
- [ ] 在低流量时段部署

### 3. 处理破坏性变更

如果你的迁移会删除字段或修改数据结构，需要分步进行：

```bash
# 错误做法：直接删除字段
# ❌ 这可能导致应用崩溃或数据丢失

# 正确做法：分 3 步
# 1. 添加新字段，保留旧字段
# 2. 更新应用代码，迁移数据
# 3. 删除旧字段（在确认新字段正常后）
```

---

## 🔧 常见场景处理

### 场景 1：首次部署到空的生产数据库

```bash
# 1. 确保本地已有完整的迁移历史
ls prisma/migrations

# 2. 部署到生产（会按顺序执行所有迁移）
DATABASE_URL=$PRODUCTION_DIRECT_URL pnpm prisma:migrate:deploy
```

### 场景 2：生产数据库落后几个版本

```bash
# Prisma 会自动检测未应用的迁移并按顺序执行
DATABASE_URL=$PRODUCTION_DIRECT_URL pnpm prisma:migrate:deploy

# 输出示例：
# 1 migration found in prisma/migrations
# Applying migration `20260108120000_add_user_avatar`
# Migration applied successfully
```

### 场景 3：修复失败的迁移

```bash
# 如果迁移失败，Prisma 会记录失败状态
# 不要直接重试！先查看问题

# 1. 查看迁移状态
npx prisma migrate status

# 2. 标记失败的迁移为已回滚
npx prisma migrate resolve --rolled-back 20260108120000_add_user_avatar

# 3. 修复迁移文件或 schema.prisma

# 4. 重新创建迁移
pnpm prisma:migrate:dev --name add_user_avatar_fixed

# 5. 部署
pnpm prisma:migrate:deploy
```

### 场景 4：从 `db push` 迁移到 `migrate` 系统

如果你之前使用的是 `db push`，现在想改用正式的迁移系统：

```bash
# 1. 确保当前 schema.prisma 与生产数据库一致

# 2. 创建基线迁移（不执行，只记录当前状态）
npx prisma migrate diff \
  --from-schema-datamodel prisma/schema.prisma \
  --to-schema-datasource prisma/schema.prisma \
  --script > prisma/migrations/20260108000000_baseline/migration.sql

# 3. 标记为已应用
npx prisma migrate resolve --applied 20260108000000_baseline

# 4. 之后就可以正常使用 migrate dev 和 migrate deploy
```

---

## 📦 Vercel 部署配置

### package.json 构建脚本

```json
{
  "scripts": {
    "build": "prisma generate && prisma migrate deploy && next build"
  }
}
```

### Vercel 环境变量（必须配置）

```env
# 1. 应用运行时连接（使用 Pooler）
DATABASE_URL=postgresql://postgres.xxx:password@aws-x.pooler.supabase.com:6543/postgres?pgbouncer=true

# 2. 迁移时连接（使用 Direct，必须有这个！）
DIRECT_URL=postgresql://postgres.xxx:password@db.xxx.supabase.co:5432/postgres

# 3. Auth 配置
AUTH_SECRET=your-random-secret-key
NEXTAUTH_URL=https://your-domain.vercel.app

# 4. OAuth 配置
GITHUB_ID=your-github-oauth-id
GITHUB_SECRET=your-github-oauth-secret
```

### prisma/schema.prisma 配置

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")       // 应用运行时用
  directUrl = env("DIRECT_URL")         // 迁移时用
}
```

---

## 🛡️ 数据备份策略

### Supabase 自动备份

1. 登录 Supabase Dashboard
2. 进入你的项目
3. 导航到 **Database** → **Backups**
4. 配置自动备份计划（Pro plan 功能）

### 手动备份

```bash
# 使用 pg_dump 导出数据库
pg_dump $PRODUCTION_DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# 或使用 Supabase CLI
supabase db dump -f backup.sql
```

### 部署前备份检查清单

```bash
# 1. 检查最后备份时间
# 在 Supabase Dashboard 查看

# 2. 创建手动备份（重要变更前）
# 在 Dashboard 点击 "Create backup"

# 3. 下载备份到本地（可选）
# 在 Dashboard 下载 .sql 文件
```

---

## ⚠️ 生产环境故障恢复

### 如果不小心清空了数据库

1. **立即停止所有操作**
2. **不要运行任何新的迁移或命令**
3. **从 Supabase 恢复最新备份**：
   - Dashboard → Database → Backups
   - 选择最近的备份
   - 点击 "Restore"

### 如果迁移导致数据不一致

```bash
# 1. 回滚到上一个稳定版本
git revert HEAD
git push

# 2. Vercel 会自动重新部署

# 3. 手动修复数据库（如果需要）
# 使用 Supabase SQL Editor 或 Prisma Studio
```

---

## ✅ 部署检查清单

在每次部署前，检查以下内容：

- [ ] ✅ 使用 `prisma migrate deploy`（不是 `db push`）
- [ ] ✅ 已在本地测试过迁移
- [ ] ✅ 迁移文件已提交到 Git
- [ ] ✅ Vercel 配置了 `DIRECT_URL` 环境变量
- [ ] ✅ 生产数据库已备份
- [ ] ✅ 在低流量时段部署
- [ ] ✅ 部署后验证数据完整性

---

## 📚 相关命令速查表

| 命令                    | 用途           | 环境 | 安全性            |
| ----------------------- | -------------- | ---- | ----------------- |
| `prisma migrate dev`    | 创建并应用迁移 | 开发 | ⚠️ 可能重置数据   |
| `prisma migrate deploy` | 部署迁移       | 生产 | ✅ 安全，保留数据 |
| `prisma migrate reset`  | 重置数据库     | 开发 | ❌ 删除所有数据   |
| `prisma db push`        | 同步 schema    | 原型 | ⚠️ 可能丢失数据   |
| `prisma generate`       | 生成 Client    | 全部 | ✅ 安全           |
| `prisma studio`         | 数据库 GUI     | 全部 | ✅ 安全（只读）   |
| `prisma migrate status` | 查看迁移状态   | 全部 | ✅ 安全           |

---

## 🎓 学习资源

- [Prisma Migrate 官方文档](https://www.prisma.io/docs/concepts/components/prisma-migrate)
- [Supabase 数据库备份](https://supabase.com/docs/guides/platform/backups)
- [Vercel 环境变量](https://vercel.com/docs/concepts/projects/environment-variables)
