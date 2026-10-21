const identifier = /^[a-z_][a-z0-9_]{0,62}$/;

export function projectSchemaName(projectId: string, environment: "draft" | "prod") {
  const shortId = projectId.replaceAll("-", "").toLowerCase().slice(0, 16);
  if (!/^[a-f0-9]{16}$/.test(shortId)) {
    throw new Error("Invalid project id for application schema");
  }
  return `app_${shortId}_${environment}`;
}

export function quoteIdentifier(value: string) {
  if (!identifier.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`);
  return `"${value}"`;
}

const forbiddenSql = /\b(drop|truncate|alter\s+(?:table|column)[\s\S]*\b(?:drop|type)\b|create\s+extension|copy|grant|revoke|set\s+role|listen|notify)\b/i;

export function validateForwardOnlyMigration(sql: string) {
  if (!sql.trim()) throw new Error("Migration is empty");
  if (forbiddenSql.test(sql)) {
    throw new Error("Migration contains a destructive or privileged statement");
  }
  if (/\b(public|platform)\s*\./i.test(sql)) {
    throw new Error("Migration cannot reference platform schemas");
  }
  return sql;
}
