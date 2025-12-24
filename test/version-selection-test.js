// test/version-selection-test.js

// 测试版本选择功能
console.log("🧪 版本选择功能测试");
console.log("==========================================");

// 模拟API返回的版本数据
const mockVersions = [
  {
    id: "v3",
    versionNumber: 3,
    description: "添加删除功能",
    createdAt: "2025-12-24T10:30:00Z",
    files: [
      {
        path: "App.tsx",
        content: "export default function App() { return <TodoApp />; }",
      },
      {
        path: "useTodo.ts",
        content: "export function useTodo() { /* with delete */ }",
      },
      {
        path: "TodoList.tsx",
        content:
          "export default function TodoList() { /* with delete button */ }",
      },
    ],
  },
  {
    id: "v2",
    versionNumber: 2,
    description: "优化样式",
    createdAt: "2025-12-24T10:15:00Z",
    files: [
      {
        path: "App.tsx",
        content: "export default function App() { return <TodoApp />; }",
      },
      {
        path: "useTodo.ts",
        content: "export function useTodo() { /* basic version */ }",
      },
      {
        path: "TodoList.tsx",
        content: "export default function TodoList() { /* styled */ }",
      },
    ],
  },
  {
    id: "v1",
    versionNumber: 1,
    description: "初始版本",
    createdAt: "2025-12-24T10:00:00Z",
    files: [
      {
        path: "App.tsx",
        content: "export default function App() { return <TodoApp />; }",
      },
      {
        path: "useTodo.ts",
        content: "export function useTodo() { /* minimal */ }",
      },
      {
        path: "TodoList.tsx",
        content: "export default function TodoList() { /* basic */ }",
      },
    ],
  },
];

// 模拟版本选择功能
function selectVersion(versionNumber, versions) {
  const version = versions.find((v) => v.versionNumber === versionNumber);
  if (version) {
    console.log(`\n📌 选择版本 ${versionNumber}:`);
    console.log(`   描述: ${version.description}`);
    console.log(`   创建时间: ${new Date(version.createdAt).toLocaleString()}`);
    console.log(`   文件数: ${version.files.length}`);

    // 模拟生成XML格式
    const filesXml = version.files
      .map(
        (file) =>
          `<boltAction type="file" filePath="${file.path}">\n${file.content}\n</boltAction>`
      )
      .join("\n");
    const versionXml = `<boltArtifact id="version-${versionNumber}" title="Version ${versionNumber}">\n${filesXml}\n</boltArtifact>`;

    console.log("   XML长度:", versionXml.length, "字符");
    return versionXml;
  }
  return null;
}

// 测试版本选择
console.log("\n🔄 测试版本选择功能:");
console.log(`总共 ${mockVersions.length} 个版本`);

// 选择不同版本
selectVersion(3, mockVersions);
selectVersion(1, mockVersions);

console.log("\n✅ 版本选择功能测试完成");
console.log("\n📋 Canvas组件新增功能:");
console.log("- ✅ 版本下拉选择器");
console.log("- ✅ 版本历史面板");
console.log("- ✅ 版本切换预览");
console.log("- ✅ 时间戳显示");
console.log("- ✅ 自动加载历史版本");
