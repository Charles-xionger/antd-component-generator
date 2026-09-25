# 生成协议 V2

## 1. 升级目标

协议 V1 只传输文件和入口，无法表达真实数据需求。V2 增加 Data Manifest、能力声明和 Schema Version，使 Generator、Sandbox、发布构建器和 Data Gateway 使用同一个契约。

V2 是破坏性协议升级，两个仓库必须使用经过验证的版本组合部署。

## 2. Artifact Payload

```ts
type ArtifactPayloadV2 = {
  protocolVersion: 2;
  generationRequestId: string;
  files: ArtifactFile[];
  entryFile: string;
  dataManifest: DataManifest;
  capabilities: Record<string, CollectionCapabilities>;
};
```

```ts
type DataManifest = {
  manifestVersion: 1;
  collections: DataCollectionDefinition[];
};
```

```ts
type DataCollectionDefinition = {
  id?: string;
  key: string;
  name: string;
  fields: DataFieldDefinition[];
};
```

```ts
type DataFieldDefinition = {
  id?: string;
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "date" | "datetime" | "enum" | "json";
  required: boolean;
  defaultValue?: unknown;
  options?: string[];
};
```

```ts
type CollectionCapabilities = {
  read: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
};
```

## 3. 消息类型

### Generator → Sandbox

```ts
type RenderArtifactMessageV2 = {
  protocolVersion: 2;
  type: "render-artifact";
  payload: ArtifactPayloadV2 & {
    projectId: string;
    environment: "DRAFT";
  };
};
```

### Sandbox → Generator

```ts
type ArtifactReadyMessageV2 = {
  protocolVersion: 2;
  type: "artifact-ready";
  payload: {
    generationRequestId: string;
    schemaVersionIds: string[];
  };
};
```

```ts
type ArtifactErrorMessageV2 = {
  protocolVersion: 2;
  type: "artifact-error";
  payload: {
    generationRequestId: string;
    stage: "PROTOCOL" | "SCHEMA" | "BUILD" | "RUNTIME" | "DATA";
    errorCode: string;
    message: string;
  };
};
```

协议不匹配时必须明确返回 `PROTOCOL_VERSION_UNSUPPORTED`，不能静默降级。

## 4. Runtime SDK

生成代码只允许通过平台 SDK 访问数据：

```ts
import {
  useProjectQuery,
  useProjectMutation,
} from "@prompt-web/runtime";
```

查询示例：

```ts
const { data, isLoading, error } = useProjectQuery({
  collection: "customers",
  page: 1,
  pageSize: 20,
  sort: [{ field: "created_at", direction: "desc" }],
});
```

修改示例：

```ts
const createCustomer = useProjectMutation({
  collection: "customers",
  action: "create",
});

await createCustomer.mutateAsync({
  requestId: crypto.randomUUID(),
  data: {
    customer_name: "示例客户",
  },
});
```

生成代码禁止：

- 导入 PostgreSQL 驱动。
- 持有 DATABASE_URL。
- 拼接 SQL。
- 使用任意远程数据地址。
- 绕过 Runtime SDK 访问 Data Gateway 管理接口。

## 5. Preview 与 Production 地址解析

SDK 使用相对路径，不在生成代码中写死域名。

Sandbox 预览时由平台注入：

```text
projectId
environment=DRAFT
previewToken 或当前登录 Session
```

公开应用使用同源请求：

```text
https://{slug}.apps.xiongerer.xyz/api/runtime/data/{collection}
```

Gateway 从 Host 解析 Project 和 activeDeployment，并固定访问 PRODUCTION 环境。

## 6. Architect 输出约束

Architect 必须区分：

- 页面展示字段。
- 用户输入字段。
- 查询和筛选字段。
- 数据集合和能力。
- 是否需要公开写入。

不得因为页面中出现统计卡片就自动创建虚假统计记录。统计结果应由真实集合计算，或者显示空状态。

## 7. Coder 输出约束

- 禁止生成默认 Mock 数据。
- 必须实现 loading、empty、error 和 success 状态。
- 使用 Runtime SDK，不直接使用任意 fetch URL。
- 修改页面样式时不能无理由修改 Data Manifest。
- 新增字段必须使用稳定 key。
- 删除或改类型只提出变更，不生成自动迁移代码。

## 8. 版本兼容

过渡期处理：

- V1 Artifact 继续使用原发布产物，不自动改写。
- V1 项目进入编辑器时显示“升级数据协议”入口。
- 升级会生成新的 ArtifactVersion 和 DataSchemaVersion。
- Generator 和 Sandbox 必须同时支持 V1 读取、V2 新建，直到历史项目完成迁移。
- V2 稳定后停止创建新的 V1 Artifact。

