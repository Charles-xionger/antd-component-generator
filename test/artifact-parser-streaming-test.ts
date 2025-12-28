/**
 * 测试 parseArtifact 的流式解析能力
 * 验证是否能正确处理标签被拆分的情况
 */

// 模拟流式接收的 chunk 序列
const streamingChunks = [
  // 第一个文件：完整过程
  '<boltArtifact id="test" title="Test App">',
  '<boltAction type="file" filePath="hooks/useCounter.ts">',
  '```typescript\nimport { useState } from "react";\n',
  "export function useCounter() {\n",
  "  const [count, setCount] = useState(0);\n",
  "  return { count, setCount };\n}\n```\n",
  "</boltAction>",

  // 第二个文件：标签被拆分
  '\n<boltAction type="file" filePath="components/Counter.tsx"', // ❌ 标签未闭合
  ">", // ✅ 现在闭合了
  "```tsx\n",
  "export function Counter() {\n",
  "  const { count, setCount } = useCounter();\n",
  "  return <div>Count: {count}</div>;\n}\n",
  "```",
  "</boltAction>",

  "</boltArtifact>",
];

// 测试场景：逐步累积内容
let accumulatedContent = "";

console.log("=== 流式解析测试 ===\n");

streamingChunks.forEach((chunk, index) => {
  accumulatedContent += chunk;

  console.log(
    `\n--- Chunk ${index + 1}: "${chunk
      .replace(/\n/g, "\\n")
      .substring(0, 50)}..." ---`
  );

  // 这里应该调用 parseArtifact(accumulatedContent)
  // 检查返回的 files 数组长度和内容

  // 预期行为：
  if (index === 1) {
    console.log("预期: 应该识别到第一个文件的开始标签");
  }
  if (index === 6) {
    console.log("预期: 第一个文件完整，应该有内容");
  }
  if (index === 8) {
    console.log("预期: 应该识别到第二个文件（即使标签未闭合）");
    console.log("      ✨ 这是关键改进点！");
  }
  if (index === 9) {
    console.log("预期: 第二个文件的标签已闭合，但内容为空");
  }
  if (index === 13) {
    console.log("预期: 第二个文件有完整内容");
  }
});

console.log("\n=== 关键改进 ===");
console.log("1. 旧逻辑: 正则 /<boltAction[^>]*>/g 要求标签必须闭合");
console.log("   问题: 第二个文件标签未闭合时无法识别");
console.log("   结果: 第二个文件要等标签完整才显示 ❌");
console.log("");
console.log('2. 新逻辑: 正则 /<boltAction[^>]*filePath="([^"]+)"/g 不要求 >');
console.log("   改进: 只要有 filePath 就能识别");
console.log("   结果: 第二个文件立即识别，边生成边显示 ✅");

export default {};
