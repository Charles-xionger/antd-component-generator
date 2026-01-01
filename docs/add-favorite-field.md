# 添加 favorite 字段到远程数据库

由于数据库在远程服务器上，需要手动执行以下 SQL 命令来添加 `favorite` 字段：

## 连接到数据库

```bash
psql -h 101.133.175.174 -p 5432 -U postgres -d antd_compoder
```

## 执行 SQL 命令

```sql
ALTER TABLE "Thread" ADD COLUMN IF NOT EXISTS "favorite" BOOLEAN DEFAULT false;
```

## 验证

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'Thread';
```

完成后，所有功能将正常工作。
