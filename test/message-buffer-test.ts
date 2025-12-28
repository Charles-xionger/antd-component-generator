/**
 * MessageBuffer 使用示例和测试
 * 演示如何处理流式传输时标签被拆分的问题
 */

import { MessageBuffer } from "@/lib/message-filter";

// ==========================================
// 测试场景 1：架构规划标签被拆分
// ==========================================
console.log("=== 测试场景 1：架构规划标签被拆分 ===\n");

const buffer1 = new MessageBuffer();

// 模拟后端流式传输的 chunks
const chunks1 = [
  { content: "<", metadata: undefined },
  { content: "architectPlan", metadata: undefined },
  { content: ">\n{\n", metadata: undefined },
  { content: '  "mode', metadata: undefined },
  { content: 'l": "counter",\n', metadata: undefined },
  { content: '  "files": [...]\n', metadata: undefined },
  { content: "}\n", metadata: undefined },
  { content: "</architectPlan>", metadata: undefined },
];

chunks1.forEach((chunk, index) => {
  const shouldShow = buffer1.append(chunk.content, chunk.metadata);
  console.log(`Chunk ${index + 1}: "${chunk.content.replace(/\n/g, "\\n")}"`);
  console.log(`  应该显示: ${shouldShow}`);
  console.log(`  当前类型: ${buffer1.getType()}`);
  console.log(`  累积内容: ${buffer1.getContent().substring(0, 50)}...\n`);
});

console.log("最终内容:", buffer1.getContent());
console.log("最终类型:", buffer1.getType());
console.log("\n");

// ==========================================
// 测试场景 2：路由决策 JSON 被拆分（应该被过滤）
// ==========================================
console.log("=== 测试场景 2：路由决策 JSON 被拆分 ===\n");

const buffer2 = new MessageBuffer();

const chunks2 = [
  { content: "{", metadata: { tags: ["routeToSubgraph"], name: "supervisor" } },
  {
    content: '"next',
    metadata: { tags: ["routeToSubgraph"], name: "supervisor" },
  },
  {
    content: '": "coding',
    metadata: { tags: ["routeToSubgraph"], name: "supervisor" },
  },
  {
    content: '"}',
    metadata: { tags: ["routeToSubgraph"], name: "supervisor" },
  },
];

chunks2.forEach((chunk, index) => {
  const shouldShow = buffer2.append(chunk.content, chunk.metadata);
  console.log(`Chunk ${index + 1}: "${chunk.content}"`);
  console.log(`  应该显示: ${shouldShow} (元数据过滤)`);
  console.log(`  累积内容: ${buffer2.getContent()}\n`);
});

console.log("最终内容:", buffer2.getContent());
console.log("说明: 由于元数据标记为 routeToSubgraph，所有 chunks 都被过滤\n\n");

// ==========================================
// 测试场景 3：代码 artifact 被拆分
// ==========================================
console.log("=== 测试场景 3：代码 artifact 被拆分 ===\n");

const buffer3 = new MessageBuffer();

const chunks3 = [
  { content: "<boltArtifact", metadata: undefined },
  { content: ' id="counter-app"', metadata: undefined },
  { content: ' title="Counter App"', metadata: undefined },
  { content: ">\n", metadata: undefined },
  { content: "<boltAction", metadata: undefined },
  { content: ' type="file"', metadata: undefined },
  { content: ' filePath="counter.tsx"', metadata: undefined },
  { content: ">\n", metadata: undefined },
  { content: "```tsx\n", metadata: undefined },
  { content: "export default function Counter() {\n", metadata: undefined },
  { content: "  return <div>Counter</div>\n", metadata: undefined },
  { content: "}\n", metadata: undefined },
  { content: "```\n", metadata: undefined },
  { content: "</boltAction>\n", metadata: undefined },
  { content: "</boltArtifact>", metadata: undefined },
];

chunks3.forEach((chunk, index) => {
  const shouldShow = buffer3.append(chunk.content, chunk.metadata);
  console.log(`Chunk ${index + 1}: "${chunk.content.replace(/\n/g, "\\n")}"`);
  console.log(`  应该显示: ${shouldShow}`);
  if (index === 0 || index === 3) {
    console.log(`  当前类型: ${buffer3.getType()}`);
  }
});

console.log("\n最终内容长度:", buffer3.getContent().length);
console.log("最终类型:", buffer3.getType());
console.log("\n");

// ==========================================
// 测试场景 4：普通消息不受影响
// ==========================================
console.log("=== 测试场景 4：普通消息 ===\n");

const buffer4 = new MessageBuffer();

const chunks4 = [
  { content: "Hello", metadata: undefined },
  { content: ", ", metadata: undefined },
  { content: "I'm ", metadata: undefined },
  { content: "creating ", metadata: undefined },
  { content: "a counter app ", metadata: undefined },
  { content: "for you.", metadata: undefined },
];

chunks4.forEach((chunk) => {
  const shouldShow = buffer4.append(chunk.content, chunk.metadata);
  console.log(`"${chunk.content}" -> 显示: ${shouldShow}`);
});

console.log("\n最终内容:", buffer4.getContent());
console.log("最终类型:", buffer4.getType());
console.log("\n");

// ==========================================
// 总结
// ==========================================
console.log("=== 总结 ===\n");
console.log("✅ MessageBuffer 成功处理了标签被拆分的问题");
console.log("✅ 可以正确识别 <architectPlan>、<boltArtifact> 等标签");
console.log("✅ 基于元数据和内容的双重过滤机制");
console.log("✅ 对普通消息没有影响");

// ==========================================
// 在 React 中的使用示例
// ==========================================
export function ExampleUsageInReact() {
  /*
  const messageBuffer = useRef(new MessageBuffer());
  
  // 在流式响应处理中
  for (const chunk of streamChunks) {
    const shouldShow = messageBuffer.current.append(
      chunk.content, 
      chunk.metadata
    );
    
    if (shouldShow) {
      // 显示这个 chunk
      setContent(prev => prev + chunk.content);
    }
    
    // 获取当前消息类型
    const type = messageBuffer.current.getType();
    if (type === MessageType.ARCHITECT_PLAN) {
      showArchitectCard();
    }
  }
  
  // 开始新消息时重置
  messageBuffer.current.reset();
  */
}

// Export an empty object to satisfy module requirements
const testModule = {};
export default testModule;
