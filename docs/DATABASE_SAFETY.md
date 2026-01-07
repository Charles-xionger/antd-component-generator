# 🚨 数据库部署重要提醒

## 问题根源

之前每次部署都清空数据库的原因：**使用了 `prisma db push` 而不是 `prisma migrate deploy`**

## 已修复的配置

### 1. ✅ package.json 构建脚本

```json
{
  "scripts": {
    "build": "prisma generate && prisma migrate deploy && next build"
  }
}
```

- `prisma migrate deploy` - **安全**，只应用新的迁移，不会清空数据
- ~~`prisma db push`~~ - ❌ 危险，会重建 schema，可能丢失数据

### 2. ✅ prisma/schema.prisma 配置

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")    // 运行时用 (Pooler URL)
  directUrl = env("DIRECT_URL")      // 迁移时用 (Direct URL)
}
```

### 3. ✅ Vercel 环境变量（必须配置）

```env
# 1. 应用运行时连接（Transaction Pooling）
DATABASE_URL=postgresql://postgres.xxx@aws-x.pooler.supabase.com:6543/postgres?pgbouncer=true

# 2. 迁移时连接（Direct Connection）- 必须有！
DIRECT_URL=postgresql://postgres.xxx@db.xxx.supabase.co:5432/postgres

# 3. 其他必需配置
AUTH_SECRET=your-secret
NEXTAUTH_URL=https://your-domain.vercel.app
GITHUB_ID=your-github-id
GITHUB_SECRET=your-github-secret
```

## 正确的开发流程

### 本地修改 Schema

```bash
# 1. 修改 prisma/schema.prisma

# 2. 创建迁移（会自动应用到本地数据库）
pnpm prisma:migrate:dev --name your_change_description

# 3. 提交迁移文件
git add prisma/migrations
git commit -m "feat: your change"
```

### 部署到生产

```bash
# 推送代码，Vercel 自动执行：
git push

# Vercel 构建时会自动运行：
# 1. prisma generate
# 2. prisma migrate deploy  ← 安全！保留数据
# 3. next build
```

## 重要命令对比

| 命令                    | 用途        | 数据安全        | 使用场景               |
| ----------------------- | ----------- | --------------- | ---------------------- |
| `prisma migrate deploy` | 部署迁移    | ✅ 安全         | **生产环境**           |
| `prisma migrate dev`    | 创建迁移    | ✅ 安全         | 本地开发               |
| `prisma db push`        | 同步 schema | ⚠️ 危险         | 快速原型（无迁移历史） |
| `prisma migrate reset`  | 重置数据库  | ❌ 删除所有数据 | 仅本地测试             |

## 现在要做什么？

### 立即行动（首次配置）

1. **在 Vercel 添加 `DIRECT_URL` 环境变量**：
   - 登录 Vercel Dashboard
   - 进入项目设置 → Environment Variables
   - 添加 `DIRECT_URL`（使用 Supabase Direct Connection URL）
2. **重新部署**：

   ```bash
   git push
   ```

3. **验证迁移成功**：
   - 在 Vercel 部署日志中查看 `prisma migrate deploy` 的输出
   - 确认显示 "No pending migrations"

### 后续开发（每次修改 Schema）

```bash
# 1. 本地创建迁移
pnpm prisma:migrate:dev --name add_new_field

# 2. 测试
pnpm dev

# 3. 提交并推送
git add .
git commit -m "feat: add new field"
git push  # Vercel 自动部署并应用迁移
```

## 数据备份建议

1. **启用 Supabase 自动备份**（如果有 Pro plan）
2. **重要变更前手动备份**：
   - Supabase Dashboard → Database → Backups → Create backup
3. **保留迁移文件在 Git 中**（已做到）

## 完整文档

- [安全的生产环境部署流程](./safe-production-deployment.md) - 详细指南
- [Supabase 部署指南](./supabase-deployment-guide.md) - Supabase 配置

## 检查清单

部署前确认：

- [x] package.json 的 build 使用 `prisma migrate deploy`
- [x] schema.prisma 配置了 `directUrl`
- [ ] Vercel 配置了 `DIRECT_URL` 环境变量 ← **你需要手动添加**
- [x] 迁移文件已提交到 Git
- [ ] 生产数据库已备份

---

**关键提醒**：从现在开始，你的数据库在每次部署时都是安全的！✅
