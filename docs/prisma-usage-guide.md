# Prisma 使用指南

本文档提供了项目中 Prisma ORM 的完整使用指南，包括配置、命令、数据模型和最佳实践。

## 目录

1. [项目配置](#项目配置)
2. [快速开始](#快速开始)
3. [常用命令](#常用命令)
4. [Schema 管理](#schema-管理)
5. [数据迁移](#数据迁移)
6. [客户端使用](#客户端使用)
7. [数据模型说明](#数据模型说明)
8. [最佳实践](#最佳实践)
9. [故障排除](#故障排除)

## 项目配置

### 环境变量

项目使用 `.env` 文件配置数据库连接：

```bash
DATABASE_URL="postgresql://user:password@host:5432/database?schema=public"
```

### Prisma 配置文件

项目使用 `prisma.config.ts` 进行配置：

```typescript
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
```

### Schema 配置

Prisma Client 生成到自定义路径：

```prisma
generator client {
  provider = "prisma-client"
  output   = "../app/generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置数据库连接

编辑 `.env` 文件，设置 `DATABASE_URL`：

```bash
DATABASE_URL="postgresql://root:123456@localhost:5432/next_langgraph?schema=public"
```

### 3. 运行数据库迁移

```bash
pnpm run prisma:migrate:dev
```

### 4. 生成 Prisma Client

```bash
pnpm run prisma:generate
```

### 5. 验证配置

```bash
pnpm run prisma:validate
```

## 常用命令

项目在 `package.json` 中提供了以下 Prisma 相关脚本：

### 客户端生成

```bash
# 生成 Prisma Client
pnpm run prisma:generate
```

**说明：**
- 根据 `schema.prisma` 生成类型安全的客户端代码
- 生成到 `app/generated/prisma` 目录
- 构建时会自动执行（已集成到 `build` 脚本）

### Schema 管理

```bash
# 格式化 schema 文件
pnpm run prisma:format

# 验证 schema 文件语法
pnpm run prisma:validate
```

### 数据库迁移

```bash
# 开发环境：创建并应用迁移
pnpm run prisma:migrate:dev

# 生产环境：仅应用已有迁移
pnpm run prisma:migrate:deploy

# 重置数据库（危险操作）
pnpm run prisma:migrate:reset

# 快速同步 schema 到数据库（不创建迁移）
pnpm run prisma:push
```

**迁移命令对比：**

| 命令 | 用途 | 适用场景 |
|------|------|----------|
| `migrate:dev` | 创建新迁移并应用 | 开发环境，需要版本控制 |
| `migrate:deploy` | 仅应用已有迁移 | 生产环境，CI/CD |
| `migrate:reset` | 重置数据库 | 开发环境，清空数据重新开始 |
| `db push` | 直接同步 schema | 快速原型开发，不需要迁移历史 |

### 数据库工具

```bash
# 打开 Prisma Studio（可视化数据库管理）
pnpm run prisma:studio
```

Prisma Studio 会在浏览器中打开（默认 `http://localhost:5555`），提供图形界面管理数据。

### 数据种子

```bash
# 运行数据库种子脚本
pnpm run prisma:seed
```

**注意：** 需要在 `package.json` 中配置 `prisma.seed` 字段才能使用此命令。

## Schema 管理

### Schema 文件位置

```
prisma/
  └── schema.prisma  # Prisma schema 定义文件
```

### 修改 Schema

1. **编辑 `prisma/schema.prisma`**
2. **验证语法：**
   ```bash
   pnpm run prisma:validate
   ```
3. **创建迁移：**
   ```bash
   pnpm run prisma:migrate:dev --name your_migration_name
   ```
4. **生成客户端：**
   ```bash
   pnpm run prisma:generate
   ```

### Schema 语法示例

```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  posts     Post[]
  
  @@index([email])
}
```

### 常用 Schema 操作

#### 添加新模型

```prisma
model NewModel {
  id   String @id @default(uuid())
  name String
}
```

#### 添加字段

```prisma
model User {
  // ... 现有字段
  phone String? // 添加可选字段
}
```

#### 添加关系

```prisma
model User {
  // ... 现有字段
  profile Profile? // 一对一关系
}

model Profile {
  id     String @id @default(uuid())
  userId String @unique
  user   User   @relation(fields: [userId], references: [id])
}
```

#### 添加索引

```prisma
model User {
  // ... 字段定义
  
  @@index([email, createdAt]) // 复合索引
}
```

## 数据迁移

### 迁移文件位置

```
prisma/
  └── migrations/
      ├── 20251222152923_init/
      │   └── migration.sql
      └── 20251224094628_init_new_db/
          └── migration.sql
```

### 创建迁移

```bash
# 交互式创建迁移
pnpm run prisma:migrate:dev

# 指定迁移名称
pnpm run prisma:migrate:dev --name add_user_table
```

### 应用迁移

```bash
# 开发环境（会提示创建迁移）
pnpm run prisma:migrate:dev

# 生产环境（仅应用已有迁移）
pnpm run prisma:migrate:deploy
```

### 查看迁移状态

```bash
npx prisma migrate status
```

### 回滚迁移

Prisma 不直接支持回滚，需要：

1. **创建新的迁移来撤销更改**
2. **或使用 `migrate:reset` 重置整个数据库**（仅开发环境）

### 迁移最佳实践

1. **每次修改 schema 后立即创建迁移**
2. **迁移名称要有意义**：`add_user_table` 而不是 `migration_1`
3. **在团队中共享迁移文件**（提交到版本控制）
4. **生产环境使用 `migrate:deploy`**，不要使用 `migrate:dev`
5. **定期备份数据库**，特别是在生产环境

## 客户端使用

### 导入 Prisma Client

项目中的 Prisma Client 位于 `lib/database/pirsma.ts`：

```typescript
import prisma from "@/lib/database/pirsma";
```

### 客户端配置

项目使用了 `@prisma/adapter-pg` 适配器：

```typescript
import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = `${process.env.DATABASE_URL}`;
const adapter = new PrismaPg({ connectionString });

const prisma = new PrismaClient({
  adapter,
});
```

### 基本查询

#### 创建记录

```typescript
const thread = await prisma.thread.create({
  data: {
    title: "新对话",
  },
});
```

#### 查询记录

```typescript
// 查询所有
const threads = await prisma.thread.findMany();

// 查询单个
const thread = await prisma.thread.findUnique({
  where: { id: "thread-id" },
});

// 条件查询
const threads = await prisma.thread.findMany({
  where: {
    title: {
      contains: "关键词",
    },
  },
  orderBy: {
    createdAt: "desc",
  },
});
```

#### 更新记录

```typescript
const thread = await prisma.thread.update({
  where: { id: "thread-id" },
  data: {
    title: "新标题",
  },
});
```

#### 删除记录

```typescript
await prisma.thread.delete({
  where: { id: "thread-id" },
});
```

### 关系查询

#### 包含关联数据

```typescript
const thread = await prisma.thread.findUnique({
  where: { id: "thread-id" },
  include: {
    artifact: {
      include: {
        versions: {
          include: {
            files: true,
          },
        },
      },
    },
  },
});
```

#### 嵌套查询

```typescript
const artifact = await prisma.artifact.create({
  data: {
    threadId: "thread-id",
    versions: {
      create: {
        versionNumber: 1,
        description: "初始版本",
        files: {
          create: [
            {
              path: "/app/page.tsx",
              content: "// 代码内容",
            },
          ],
        },
      },
    },
  },
});
```

### 事务处理

```typescript
await prisma.$transaction(async (tx) => {
  const thread = await tx.thread.create({
    data: { title: "新对话" },
  });
  
  const artifact = await tx.artifact.create({
    data: {
      threadId: thread.id,
    },
  });
  
  return { thread, artifact };
});
```

### 原始 SQL 查询

```typescript
const results = await prisma.$queryRaw`
  SELECT * FROM "Thread" WHERE "title" = ${title}
`;
```

### 连接管理

在 Next.js 中，建议使用单例模式：

```typescript
// lib/database/pirsma.ts
const globalForPrisma = global as unknown as { prisma: PrismaClient };

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
```

这样可以避免在开发环境中创建多个 Prisma Client 实例。

## 数据模型说明

项目包含以下数据模型：

### Thread（对话）

```prisma
model Thread {
  id        String   @id @default(uuid())
  title     String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  artifact  Artifact?
}
```

**说明：**
- 表示一个对话会话
- 与 `Artifact` 是一对一关系
- 自动生成 UUID 作为主键

### Artifact（项目工件）

```prisma
model Artifact {
  id        String   @id @default(uuid())
  threadId  String   @unique
  thread    Thread   @relation(fields: [threadId], references: [id], onDelete: Cascade)
  versions  ArtifactVersion[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**说明：**
- 表示 Canvas 中的项目
- 与 `Thread` 一对一关联
- 包含多个版本历史

### ArtifactVersion（代码版本）

```prisma
model ArtifactVersion {
  id             String   @id @default(uuid())
  artifactId     String
  artifact       Artifact @relation(fields: [artifactId], references: [id], onDelete: Cascade)
  versionNumber  Int
  description    String?
  files          File[]
  createdAt      DateTime @default(now())
  
  @@index([artifactId, versionNumber])
}
```

**说明：**
- 表示项目的某个版本快照
- 包含版本号和描述（commit message）
- 有复合索引优化查询性能

### File（文件）

```prisma
model File {
  id                String          @id @default(uuid())
  artifactVersionId String
  artifactVersion   ArtifactVersion @relation(fields: [artifactVersionId], references: [id], onDelete: Cascade)
  path              String
  content           String          @db.Text
  @@unique([artifactVersionId, path])
}
```

**说明：**
- 存储文件路径和内容
- 同一版本下路径唯一
- 使用 `@db.Text` 存储大文本内容

### MCPConfig（MCP 配置）

```prisma
model MCPConfig {
  id          String   @id @default(uuid())
  name        String
  url         String
  description String?
  enabled     Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

**说明：**
- 存储 MCP 服务器配置
- 支持启用/禁用状态

## 最佳实践

### 1. Schema 设计

- ✅ **使用有意义的字段名**：`createdAt` 而不是 `ct`
- ✅ **添加必要的索引**：提高查询性能
- ✅ **使用级联删除**：`onDelete: Cascade` 保持数据一致性
- ✅ **添加时间戳**：`createdAt` 和 `updatedAt` 便于追踪

### 2. 查询优化

- ✅ **使用 `select` 而不是 `include`**：只查询需要的字段
- ✅ **添加适当的 `where` 条件**：减少数据传输
- ✅ **使用分页**：`take` 和 `skip` 处理大量数据
- ✅ **利用索引**：在经常查询的字段上添加索引

```typescript
// 好的做法
const threads = await prisma.thread.findMany({
  select: {
    id: true,
    title: true,
  },
  where: {
    createdAt: {
      gte: new Date("2024-01-01"),
    },
  },
  take: 10,
  skip: 0,
});

// 避免
const threads = await prisma.thread.findMany(); // 查询所有字段和数据
```

### 3. 错误处理

```typescript
try {
  const thread = await prisma.thread.findUnique({
    where: { id: "thread-id" },
  });
  
  if (!thread) {
    throw new Error("Thread not found");
  }
  
  return thread;
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // 处理 Prisma 已知错误
    if (error.code === "P2025") {
      // 记录不存在
    }
  }
  throw error;
}
```

### 4. 类型安全

Prisma 自动生成 TypeScript 类型，充分利用：

```typescript
import { Thread, Artifact } from "@/app/generated/prisma/client";

function processThread(thread: Thread) {
  // TypeScript 会检查类型
}
```

### 5. 环境管理

- ✅ **开发环境**：使用 `migrate:dev` 和 `db push`
- ✅ **生产环境**：使用 `migrate:deploy`，禁用 `db push`
- ✅ **测试环境**：使用独立的测试数据库

### 6. 性能优化

```typescript
// 使用连接池
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: process.env.NODE_ENV === "development" ? ["query", "error"] : ["error"],
});

// 批量操作
await prisma.thread.createMany({
  data: threads,
  skipDuplicates: true,
});
```

## 故障排除

### 常见问题

#### 1. Prisma Client 未生成

**错误：**
```
Module not found: Can't resolve '@/app/generated/prisma/client'
```

**解决方案：**
```bash
pnpm run prisma:generate
```

#### 2. 数据库连接失败

**错误：**
```
Can't reach database server
```

**解决方案：**
1. 检查 `DATABASE_URL` 环境变量
2. 验证数据库服务是否运行
3. 检查网络连接和防火墙设置

#### 3. 迁移冲突

**错误：**
```
Migration failed to apply
```

**解决方案：**
```bash
# 查看迁移状态
npx prisma migrate status

# 重置迁移（仅开发环境）
pnpm run prisma:migrate:reset

# 或手动修复迁移文件
```

#### 4. Schema 验证失败

**错误：**
```
Error validating model
```

**解决方案：**
```bash
# 验证 schema
pnpm run prisma:validate

# 格式化 schema
pnpm run prisma:format
```

#### 5. 类型错误

**错误：**
```
Type 'X' is not assignable to type 'Y'
```

**解决方案：**
1. 重新生成 Prisma Client：`pnpm run prisma:generate`
2. 重启 TypeScript 服务器
3. 检查 schema 定义是否正确

### 调试技巧

#### 启用查询日志

```typescript
const prisma = new PrismaClient({
  log: [
    { level: "query", emit: "event" },
    { level: "error", emit: "stdout" },
    { level: "warn", emit: "stdout" },
  ],
});

prisma.$on("query", (e) => {
  console.log("Query: " + e.query);
  console.log("Duration: " + e.duration + "ms");
});
```

#### 使用 Prisma Studio 调试

```bash
pnpm run prisma:studio
```

在浏览器中查看和编辑数据，便于调试。

#### 检查数据库状态

```bash
# 查看迁移状态
npx prisma migrate status

# 查看数据库结构
npx prisma db pull

# 验证连接
npx prisma db execute --stdin < /dev/null
```

### 性能问题

#### 慢查询

1. **检查索引**：确保常用查询字段有索引
2. **使用 `select`**：只查询需要的字段
3. **添加分页**：避免一次性加载大量数据
4. **使用 `findFirst` 而不是 `findMany`**：如果只需要一条记录

#### 连接池问题

```typescript
// 增加连接池大小
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL + "?connection_limit=10",
    },
  },
});
```

## 相关资源

- [Prisma 官方文档](https://www.prisma.io/docs)
- [Prisma Schema 参考](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference)
- [Prisma Client API](https://www.prisma.io/docs/reference/api-reference/prisma-client-reference)
- [数据库迁移指南](./database-migration-guide.md)

---

**最后更新：** 2024-12-24

如有问题或建议，请参考故障排除章节或查阅 Prisma 官方文档。

