// test/json-parser-test.ts

// 复制我们添加的JSON解析工具函数
function extractJSONFromResponse(response: string): string {
  // 移除markdown代码块标记
  let cleaned = response.trim();

  // 检查是否有```json...```格式
  const jsonBlockMatch = cleaned.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch) {
    cleaned = jsonBlockMatch[1].trim();
  }

  // 检查是否有```...```格式（没有language标识符）
  const codeBlockMatch = cleaned.match(/```\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    const content = codeBlockMatch[1].trim();
    // 验证是否是JSON格式（以{开头，以}结尾）
    if (content.startsWith("{") && content.endsWith("}")) {
      cleaned = content;
    }
  }

  return cleaned;
}

// 测试用例
const testCases = [
  // 案例1：带有```json标记的响应
  {
    input: `这是一个响应:
\`\`\`json
{
  "files": [
    {"path": "/App.tsx", "description": "主应用组件"}
  ],
  "dependencies": [],
  "architecture_notes": "使用React创建应用"
}
\`\`\``,
    expected: `{
  "files": [
    {"path": "/App.tsx", "description": "主应用组件"}
  ],
  "dependencies": [],
  "architecture_notes": "使用React创建应用"
}`,
  },

  // 案例2：只有```标记的响应
  {
    input: `\`\`\`
{
  "files": [
    {"path": "/components/StudentTable.tsx", "description": "学生表格组件"}
  ],
  "dependencies": ["react", "@types/react"],
  "architecture_notes": "创建响应式表格"
}
\`\`\``,
    expected: `{
  "files": [
    {"path": "/components/StudentTable.tsx", "description": "学生表格组件"}
  ],
  "dependencies": ["react", "@types/react"],
  "architecture_notes": "创建响应式表格"
}`,
  },

  // 案例3：纯JSON，没有代码块标记
  {
    input: `{
  "files": [
    {"path": "/App.tsx", "description": "主应用组件"}
  ],
  "dependencies": [],
  "architecture_notes": "简单的应用"
}`,
    expected: `{
  "files": [
    {"path": "/App.tsx", "description": "主应用组件"}
  ],
  "dependencies": [],
  "architecture_notes": "简单的应用"
}`,
  },
];

// 运行测试
console.log("开始测试JSON解析器...");

testCases.forEach((testCase, index) => {
  try {
    const result = extractJSONFromResponse(testCase.input);
    const parsed = JSON.parse(result);
    console.log(`✅ 测试案例 ${index + 1} 通过`);
    console.log("解析结果:", parsed);
  } catch (error) {
    console.log(`❌ 测试案例 ${index + 1} 失败:`, error.message);
    console.log("输入:", testCase.input);
    console.log("提取结果:", extractJSONFromResponse(testCase.input));
  }
  console.log("---");
});

console.log("测试完成");

export { extractJSONFromResponse };
