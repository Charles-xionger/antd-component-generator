# 数据库迁移指南

本文档提供了将项目数据库从 Prisma Cloud 迁移到自建 PostgreSQL 服务器的完整操作指南，包括 Docker 部署和配置步骤。

## 目录

1. [准备工作](#准备工作)
2. [Docker 部署 PostgreSQL](#docker-部署-postgresql)
3. [配置文件更新](#配置文件更新)
4. [数据库迁移](#数据库迁移)
5. [验证和测试](#验证和测试)
6. [故障排除](#故障排除)

## 准备工作

### 当前配置

- 原数据库：Prisma Cloud PostgreSQL
- 目标数据库：自建 PostgreSQL（IP: 101.133.175.174）
- 新数据库名：`next_langgraph`（语义化命名）

### 备份现有数据

```bash
# 如果有重要数据，先备份
npx prisma db pull
```

## Docker 部署 PostgreSQL

### 1. Docker Compose 配置

创建 `docker-compose.yml` 文件：

```yaml
version: "3.8"

services:
  postgres:
    image: postgres:15-alpine
    container_name: next_langgraph_db
    restart: unless-stopped
    environment:
      POSTGRES_USER: root
      POSTGRES_PASSWORD: 123456
      POSTGRES_DB: next_langgraph
      POSTGRES_INITDB_ARGS: "--encoding=UTF-8"
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init-scripts:/docker-entrypoint-initdb.d
    networks:
      - app_network

  # 可选：PgAdmin 管理界面
  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: next_langgraph_pgadmin
    restart: unless-stopped
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@example.com
      PGADMIN_DEFAULT_PASSWORD: admin123
    ports:
      - "5050:80"
    depends_on:
      - postgres
    networks:
      - app_network

volumes:
  postgres_data:

networks:
  app_network:
    driver: bridge
```

### 2. 初始化脚本

创建 `init-scripts/01-init.sql`：

```sql
-- 创建应用数据库
CREATE DATABASE next_langgraph;

-- 创建应用用户（可选，如需要专门的应用用户）
CREATE USER app_user WITH PASSWORD 'app_password';
GRANT ALL PRIVILEGES ON DATABASE next_langgraph TO app_user;

-- 扩展支持
\c next_langgraph;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

### 3. 启动 Docker 服务

```bash
# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f postgres

# 验证容器状态
docker-compose ps
```

### 4. 网络和防火墙配置

```bash
# CentOS/RHEL 防火墙配置
sudo firewall-cmd --permanent --add-port=5432/tcp
sudo firewall-cmd --reload

# Ubuntu/Debian 防火墙配置
sudo ufw allow 5432/tcp

# 验证端口监听
netstat -tlnp | grep :5432
```

## 配置文件更新

### 1. 更新环境变量

编辑 `.env` 文件：

```bash
# 旧配置（注释掉）
# DATABASE_URL="postgres://old_connection_string"

# 新配置
DATABASE_URL="postgresql://root:123456@101.133.175.174:5432/next_langgraph?schema=public"

# 如果使用 Docker 本地部署
# DATABASE_URL="postgresql://root:123456@localhost:5432/next_langgraph?schema=public"

# 其他环境变量保持不变
ALIYUN_API_KEY=sk-081eb693db3f4dfb8a7d02650930165d
ALIYUN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
ALIYUN_INTL_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
NEXT_PUBLIC_ALIYUN_MODEL_NAME=qwen3-max
MCP_SERVER_URL=https://drawing-mcp.xiongerer.xyz/mcp
```

### 2. 更新 Prisma Schema

编辑 `prisma/schema.prisma`：

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client"
  output   = "../app/generated/prisma"
}

// 模型定义保持不变
model Thread {
  id        String   @id @default(uuid())
  title     String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  artifact  Artifact?
}

// ... 其他模型
```

## 数据库迁移

### 1. 重置 Prisma 状态

```bash
# 清理现有迁移状态
rm -rf prisma/migrations

# 重新初始化迁移
npx prisma migrate reset --force --skip-generate
```

### 2. 创建新迁移

```bash
# 生成初始迁移
npx prisma migrate dev --name init_new_database

# 或者直接部署到生产环境
npx prisma migrate deploy
```

### 3. 生成 Prisma Client

```bash
# 重新生成客户端
npx prisma generate

# 验证生成的文件
ls -la app/generated/prisma/
```

### 4. 验证数据库连接

```bash
# 检查数据库状态
npx prisma migrate status

# 查看数据库结构
npx prisma studio
```

## 验证和测试

### 1. 连接测试

```bash
# 测试数据库连接
npx prisma db push --accept-data-loss

# 运行数据库种子（如果有）
npx prisma db seed
```

### 2. 应用测试

```bash
# 启动开发服务器
npm run dev

# 测试数据库相关功能
curl -X GET http://localhost:3000/api/agent/history
```

### 3. 生产环境测试

```bash
# 构建应用
npm run build

# 启动生产服务器
npm start
```

## 故障排除

### 常见问题

#### 1. 连接被拒绝

```
Error: connect ECONNREFUSED 101.133.175.174:5432
```

**解决方案：**

- 检查防火墙设置
- 验证 PostgreSQL 服务是否运行
- 确认 `postgresql.conf` 中 `listen_addresses` 设置

#### 2. 认证失败

```
Error: password authentication failed
```

**解决方案：**

- 检查用户名和密码
- 验证 `pg_hba.conf` 配置
- 确认用户权限

#### 3. 数据库不存在

```
Error: database "next_langgraph" does not exist
```

**解决方案：**

```sql
-- 手动创建数据库
CREATE DATABASE next_langgraph;
```

#### 4. SSL 连接问题

```
Error: SSL connection required
```

**解决方案：**

```bash
# 在连接字符串中添加 SSL 参数
DATABASE_URL="postgresql://user:pass@host:5432/db?sslmode=require"
# 或禁用 SSL
DATABASE_URL="postgresql://user:pass@host:5432/db?sslmode=disable"
```

### 调试命令

```bash
# 查看 PostgreSQL 日志
docker-compose logs postgres

# 进入数据库容器
docker exec -it next_langgraph_db psql -U root -d next_langgraph

# 检查网络连通性
telnet 101.133.175.174 5432

# 验证 Prisma 配置
npx prisma validate
```

### 性能优化

#### PostgreSQL 配置优化

编辑 `postgresql.conf`：

```conf
# 内存设置
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB

# 连接设置
max_connections = 100

# 日志设置
log_statement = 'all'
log_min_duration_statement = 1000
```

#### 应用层优化

```javascript
// 数据库连接池配置
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: ["query", "error", "warn"],
});
```

## 环境特定配置

### 开发环境

```bash
# .env.development
DATABASE_URL="postgresql://root:123456@localhost:5432/next_langgraph_dev?schema=public"
```

### 生产环境

```bash
# .env.production
DATABASE_URL="postgresql://root:123456@101.133.175.174:5432/next_langgraph?schema=public&sslmode=require"
```

### 测试环境

```bash
# .env.test
DATABASE_URL="postgresql://root:123456@localhost:5432/next_langgraph_test?schema=public"
```

## 监控和维护

### 1. 数据库监控

```sql
-- 查看活动连接
SELECT * FROM pg_stat_activity;

-- 查看数据库大小
SELECT pg_database_size('next_langgraph') / 1024 / 1024 as size_mb;

-- 查看表大小
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(tablename::text)) as size
FROM pg_tables
WHERE schemaname = 'public';
```

### 2. 备份策略

```bash
# 自动备份脚本
#!/bin/bash
BACKUP_DIR="/backup/postgres"
DATE=$(date +%Y%m%d_%H%M%S)
FILENAME="next_langgraph_${DATE}.sql"

pg_dump -h 101.133.175.174 -U root -d next_langgraph > "${BACKUP_DIR}/${FILENAME}"
gzip "${BACKUP_DIR}/${FILENAME}"

# 保留最近 7 天的备份
find ${BACKUP_DIR} -name "*.sql.gz" -mtime +7 -delete
```

---

**完成迁移后，请确保：**

1. ✅ 应用能正常连接新数据库
2. ✅ 所有 API 接口正常工作
3. ✅ 数据库备份策略已实施
4. ✅ 监控和日志记录正常
5. ✅ 性能表现符合预期

如有问题，请参考故障排除章节或联系数据库管理员。
