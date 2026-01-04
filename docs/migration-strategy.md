# 数据库迁移策略 - 保留现有数据

## 问题说明

现有的 `Thread` 表没有 `userId` 字段，但新 schema 要求每个 Thread 必须关联一个用户。

## 推荐方案：创建系统用户

### 步骤 1：备份数据（可选但推荐）

```bash
# 导出现有数据
pg_dump -U postgres -d your_database > backup_before_auth.sql
```

### 步骤 2：临时修改 schema，让 userId 可选

在运行迁移前，暂时修改 `prisma/schema.prisma`：

```prisma
model Thread {
  // ... 其他字段
  userId    String?  // 加问号，让它可选
  user      User?    @relation(fields: [userId], references: [id], onDelete: Cascade)
  // ... 其他字段
}
```

### 步骤 3：生成并运行迁移

```bash
# 生成迁移文件
pnpm prisma migrate dev --name add_auth_with_optional_user

# Prisma 会创建 User, Account, Session 表
# Thread 表会添加可选的 userId 字段
```

### 步骤 4：创建系统用户并关联旧数据

```bash
# 在数据库中执行以下 SQL
psql -U postgres -d your_database
```

```sql
-- 创建一个系统用户（UUID 固定，方便识别）
INSERT INTO "User" (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'Legacy User',
  'legacy@system.local',
  NOW(),
  NULL,
  NOW(),
  NOW()
);

-- 将所有没有 userId 的 Thread 关联到系统用户
UPDATE "Thread"
SET "userId" = '00000000-0000-0000-0000-000000000000'
WHERE "userId" IS NULL;
```

### 步骤 5：改回必填约束

修改 `prisma/schema.prisma`，去掉问号：

```prisma
model Thread {
  // ... 其他字段
  userId    String   // 必填
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  // ... 其他字段
}
```

再次生成迁移：

```bash
pnpm prisma migrate dev --name make_userid_required
```

## 方案 2：清空旧数据（如果不需要保留）

如果旧数据不重要，可以直接：

```bash
# 重置数据库
pnpm prisma migrate reset

# 这会删除所有数据并重新创建表结构
```

## 后续处理

首次 GitHub 登录后，你可以选择：

1. 继续使用"Legacy User"的旧数据
2. 编写脚本将旧数据转移到真实用户下
3. 或者提供 UI 让用户认领旧数据

## 推荐的完整命令序列

```bash
# 1. 备份（可选）
pg_dump -U postgres -d your_database > backup.sql

# 2. 修改 schema 让 userId 可选（见上方）

# 3. 运行迁移
pnpm prisma migrate dev --name add_auth_with_optional_user

# 4. 创建系统用户并关联数据（SQL见上方）

# 5. 改回必填约束并再次迁移
pnpm prisma migrate dev --name make_userid_required

# 6. 生成 Prisma Client
pnpm prisma generate
```

## 验证

```bash
# 检查数据
pnpm prisma studio

# 验证所有 Thread 都有 userId
```
