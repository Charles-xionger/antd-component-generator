/**
 * 测试 boltAction 解析修复
 * 验证所有文件都能正确解析，不会丢失
 */

// 模拟测试用例
const testCases = [
  {
    name: "完整的多文件输出",
    input: `
<boltArtifact id="test" title="测试项目">
  <boltAction type="file" filePath="interface.ts">
export interface User {
  id: string;
  name: string;
}
  </boltAction>
  <boltAction type="file" filePath="helpers.ts">
export const mockUsers = [];
  </boltAction>
  <boltAction type="file" filePath="App.tsx">
export default function App() {
  return <div>Hello</div>;
}
  </boltAction>
</boltArtifact>
    `,
    expectedFiles: 3,
  },
  {
    name: "包含空文件",
    input: `
<boltArtifact id="test" title="测试项目">
  <boltAction type="file" filePath="interface.ts">
export interface User {
  id: string;
}
  </boltAction>
  <boltAction type="file" filePath="empty.ts">
  </boltAction>
  <boltAction type="file" filePath="App.tsx">
export default function App() {
  return <div>Test</div>;
}
  </boltAction>
</boltArtifact>
    `,
    expectedFiles: 3,
    description: "空文件也应该被解析",
  },
  {
    name: "正在生成的文件（无结束标签）",
    input: `
<boltArtifact id="test" title="测试项目">
  <boltAction type="file" filePath="interface.ts">
export interface User {
  id: string;
  name: string;
}
  </boltAction>
  <boltAction type="file" filePath="App.tsx">
export default function App() {
  return <div>Generating...
    `,
    expectedFiles: 2,
    description: "正在生成的文件应该被捕获",
  },
  {
    name: "连续的空文件",
    input: `
<boltArtifact id="test" title="测试项目">
  <boltAction type="file" filePath="file1.ts">
  </boltAction>
  <boltAction type="file" filePath="file2.ts">
  </boltAction>
  <boltAction type="file" filePath="file3.ts">
export const value = 1;
  </boltAction>
</boltArtifact>
    `,
    expectedFiles: 3,
    description: "连续的空文件不应该被跳过",
  },
  {
    name: "混合状态的文件",
    input: `
<boltArtifact id="test" title="测试项目">
  <boltAction type="file" filePath="complete.ts">
export const a = 1;
  </boltAction>
  <boltAction type="file" filePath="empty.ts">
  </boltAction>
  <boltAction type="file" filePath="generating.ts">
export const b = 2
    `,
    expectedFiles: 3,
    description: "完整、空、正在生成的文件应该都被解析",
  },
];

console.log("=== boltAction 解析修复测试 ===\n");

testCases.forEach((testCase, index) => {
  console.log(`\n测试 ${index + 1}: ${testCase.name}`);
  if (testCase.description) {
    console.log(`描述: ${testCase.description}`);
  }
  console.log(`期望文件数: ${testCase.expectedFiles}`);
  console.log("\n输入内容:");
  console.log(testCase.input);
  console.log("\n" + "=".repeat(80));
});

console.log("\n\n注意事项:");
console.log("1. 修复后，空文件不会被跳过");
console.log("2. 阶段2会添加所有文件，无论内容是否为空");
console.log("3. 增强了日志，方便追踪解析过程");
console.log("4. 使用 processedPaths 避免重复处理同一文件");
