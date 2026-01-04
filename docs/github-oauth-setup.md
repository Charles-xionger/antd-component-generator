# GitHub OAuth 登录配置指南

本项目使用 Auth.js v5 + GitHub OAuth 实现用户认证。

## 快速开始

### 1. 创建 GitHub OAuth 应用

1. 访问 [GitHub Settings - Developer settings](https://github.com/settings/developers)
2. 点击 "New OAuth App"
3. 填写应用信息：
   - **Application name**: `Your App Name`
   - **Homepage URL**: `http://localhost:3000` (开发环境)
   - **Authorization callback URL**: `http://localhost:3000/api/auth/callback/github`
4. 点击 "Register application"
5. 保存生成的 **Client ID** 和 **Client Secret**

### 2. 配置环境变量

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入你的配置：

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/dbname"

# Auth.js Secret (生成方式见下方)
AUTH_SECRET="your-random-secret-32-chars"
NEXTAUTH_URL="http://localhost:3000"

# GitHub OAuth (从上一步获取)
GITHUB_ID="your-github-client-id"
GITHUB_SECRET="your-github-client-secret"

# OpenAI
OPENAI_API_KEY="your-openai-api-key"
```

**生成 AUTH_SECRET：**

```bash
openssl rand -base64 32
```

### 3. 运行数据库迁移

```bash
# 生成 Prisma Client
pnpm prisma generate

# 创建数据库迁移
pnpm prisma migrate dev --name add_auth_tables

# 或者直接推送 schema（开发环境）
pnpm prisma db push
```

### 4. 启动项目

```bash
pnpm dev
```

访问 `http://localhost:3000`，会自动重定向到登录页。

## 数据库变更

### 新增的表

- **User**: 用户基本信息
- **Account**: OAuth 账号关联信息
- **Session**: 用户会话
- **VerificationToken**: 验证令牌

### 修改的表

- **Thread**: 添加 `userId` 字段，关联到 User 表

## 生产环境配置

### 1. 更新 GitHub OAuth App

在 GitHub OAuth App 设置中：

- **Homepage URL**: `https://yourdomain.com`
- **Authorization callback URL**: `https://yourdomain.com/api/auth/callback/github`

### 2. 更新环境变量

```env
NEXTAUTH_URL="https://yourdomain.com"
AUTH_SECRET="<新的随机密钥>"
```

## 功能说明

### 认证流程

1. **未登录用户** → 自动重定向到 `/login`
2. **点击"使用 GitHub 登录"** → 跳转 GitHub 授权
3. **授权成功** → 创建用户和 session，重定向到首页
4. **登录后** → 可以访问所有功能

### 用户数据隔离

- 每个用户只能看到自己的会话（Thread）
- Thread 通过 `userId` 字段关联用户
- API 自动过滤用户数据

### 登出功能

点击右上角用户头像 → 登出

## 常见问题

### Q: 登录后报错 "Session callback error"

**A:** 检查数据库连接是否正常，Prisma adapter 需要能访问数据库。

### Q: GitHub OAuth 回调失败

**A:** 确认：

1. 回调 URL 是否正确配置：`http://localhost:3000/api/auth/callback/github`
2. GITHUB_ID 和 GITHUB_SECRET 是否正确
3. 网络是否能访问 GitHub

### Q: AUTH_SECRET 有什么用？

**A:** 用于加密 session token 和 CSRF token，必须保密且足够随机。

### Q: 如何添加更多 OAuth 提供商？

**A:** 在 `lib/auth.ts` 中添加更多 providers：

```typescript
providers: [
  GitHub({...}),
  Google({
    clientId: process.env.GOOGLE_ID!,
    clientSecret: process.env.GOOGLE_SECRET!,
  }),
]
```

## 相关链接

- [Auth.js 文档](https://authjs.dev)
- [GitHub OAuth Apps](https://docs.github.com/en/apps/oauth-apps)
- [Prisma Adapter](https://authjs.dev/reference/adapter/prisma)
