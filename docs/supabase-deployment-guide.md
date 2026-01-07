# Supabase 生产环境部署指南

## 📋 前提条件

1. 已有 [Supabase](https://app.supabase.com/) 账号和项目
2. 已安装 Prisma CLI: `pnpm install -D prisma`

## 🚀 部署步骤

### 1. 获取 Supabase 数据库连接信息

登录 Supabase Dashboard，进入你的项目：

1. 导航到 **Project Settings** → **Database**
2. 找到 **Connection String** 部分
3. 选择 **Use connection pooling** (推荐用于生产环境)
4. 复制以下两个连接字符串：
   - **Transaction mode** (用于应用运行时) → `DATABASE_URL`
   - **Direct connection** (用于数据库迁移) → `DIRECT_URL`

### 2. 配置环境变量

#### Vercel 部署

在 Vercel Dashboard 中添加环境变量：

```bash
# 数据库连接 (Connection Pooling - Transaction Mode)
DATABASE_URL=postgresql://postgres.xxxxx:password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true

# 直接连接 (用于 Prisma Migrate)
DIRECT_URL=postgresql://postgres.xxxxx:password@db.xxxxx.supabase.co:5432/postgres

# Auth.js 配置
AUTH_SECRET=your-production-auth-secret
NEXTAUTH_URL=https://your-domain.com

# GitHub OAuth (从 GitHub Settings 获取)
GITHUB_ID=your-github-oauth-client-id
GITHUB_SECRET=your-github-oauth-client-secret

# AI 模型配置
AI302_API_KEY=your-302-ai-api-key
AI302_BASE_URL=https://api.302.ai/v1
GOOGLE_API_KEY=your-google-api-key
```

#### Docker/自托管部署

创建 `.env.production` 文件，添加相同的环境变量。

### 3. 运行数据库迁移

#### 本地迁移到 Supabase

```bash
# 1. 设置环境变量
export DATABASE_URL="postgresql://postgres.xxxxx:..."
export DIRECT_URL="postgresql://postgres.xxxxx:..."

# 2. 生成 Prisma Client
pnpm prisma:generate

# 3. 运行迁移（首次部署）
pnpm prisma:migrate:deploy

# 或者直接推送 schema（不创建迁移文件）
pnpm prisma:push
```

#### Vercel 自动迁移

在 `package.json` 中已配置自动迁移：

```json
{
  "scripts": {
    "build": "prisma generate && prisma migrate deploy && next build"
  }
}
```

Vercel 部署时会自动执行迁移。

### 4. 验证部署

#### 检查数据库连接

```bash
# 本地测试连接
pnpm prisma:studio
```

#### 检查表结构

登录 Supabase Dashboard → **Table Editor**，确认以下表已创建：

- `User`
- `Account`
- `Session`
- `Thread`
- `Artifact`
- `ArtifactVersion`
- 其他业务表

### 5. 生产环境优化

#### Supabase 连接池配置

在 Supabase Dashboard → **Database** → **Connection Pooling**:

- **Pool mode**: Transaction (推荐，适合 Serverless)
- **Pool size**: 15-20 (根据项目规模调整)
- **Default pool size**: 20

#### Prisma 连接池配置

```typescript
// lib/database/prisma.ts
const prisma = new PrismaClient({
  log:
    process.env.NODE_ENV === "development"
      ? ["query", "error", "warn"]
      : ["error"],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// 生产环境推荐配置
export const prismaConfig = {
  connectionLimit: 10, // 根据 Supabase plan 调整
  connectionTimeout: 10000,
};
```

## 🔒 安全最佳实践

### 1. 数据库安全

- ✅ 使用环境变量存储连接字符串，不要硬编码
- ✅ 启用 Supabase 的 Row Level Security (RLS)
- ✅ 定期更新数据库密码
- ✅ 限制数据库访问 IP（如果不是 Serverless）

### 2. 认证安全

```bash
# 生成强随机密钥
openssl rand -base64 32
```

### 3. API 密钥管理

- 使用 Vercel Environment Variables 或 Secrets Manager
- 不同环境使用不同的 API 密钥
- 定期轮换 API 密钥

## 📊 监控与日志

### Supabase Dashboard 监控

- **Database** → **Database Health**: 查看连接数、查询性能
- **Logs**: 查看数据库查询日志
- **Reports**: 查看 API 使用情况

### 应用层监控

```typescript
// lib/database/prisma.ts
const prisma = new PrismaClient({
  log: [
    { emit: "event", level: "query" },
    { emit: "event", level: "error" },
  ],
});

prisma.$on("query", (e) => {
  console.log("Query: " + e.query);
  console.log("Duration: " + e.duration + "ms");
});

prisma.$on("error", (e) => {
  console.error("Prisma Error:", e);
});
```

## 🐛 常见问题

### 1. 连接超时

**问题**: `Error: connect ETIMEDOUT`

**解决方案**:

- 检查 `DATABASE_URL` 是否正确
- 确认使用 Connection Pooling URL
- 检查 Supabase 项目是否暂停（Free plan 会自动暂停）

### 2. Too many connections

**问题**: `Error: too many connections for role "postgres"`

**解决方案**:

- 使用 Connection Pooling (`pgbouncer=true`)
- 减少 Prisma 连接池大小
- 升级 Supabase plan

### 3. 迁移失败

**问题**: `prisma migrate deploy` 失败

**解决方案**:

```bash
# 使用 DIRECT_URL 运行迁移
DATABASE_URL=$DIRECT_URL pnpm prisma:migrate:deploy

# 或者使用 db push（跳过迁移历史）
DATABASE_URL=$DIRECT_URL pnpm prisma:push
```

### 4. Serverless 环境连接问题

**问题**: Vercel/Netlify 等 Serverless 环境连接不稳定

**解决方案**:

- 必须使用 Connection Pooling
- 在 `prisma/schema.prisma` 中配置 `directUrl`
- 考虑使用 `@prisma/adapter-pg` (已安装)

## 🔄 持续集成/持续部署 (CI/CD)

### GitHub Actions 示例

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: "20"

      - name: Install dependencies
        run: pnpm install

      - name: Run database migration
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          DIRECT_URL: ${{ secrets.DIRECT_URL }}
        run: pnpm prisma:migrate:deploy

      - name: Deploy to Vercel
        run: vercel --prod
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
```

## 📚 相关文档

- [Supabase Database](https://supabase.com/docs/guides/database)
- [Prisma with Supabase](https://www.prisma.io/docs/guides/database/supabase)
- [Next.js Environment Variables](https://nextjs.org/docs/basic-features/environment-variables)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
