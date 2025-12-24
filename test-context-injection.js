// test-context-injection.js

// 简单测试 context injection 逻辑
function formatCodeContext(files) {
  if (!files.length) return "这是一个新项目，没有现有代码。";

  return files
    .map((file) => `File: ${file.path}\n\`\`\`\n${file.content}\n\`\`\``)
    .join("\n\n");
}

// 模拟前一个版本的文件
const mockFiles = [
  {
    path: "App.tsx",
    content: `export default function App() {
  return (
    <div className="p-4">
      <h1>Todo App</h1>
      <TodoList />
    </div>
  );
}`,
  },
  {
    path: "useTodo.ts",
    content: `export function useTodo() {
  const [todos, setTodos] = useState([]);
  const addTodo = (text) => setTodos([...todos, { id: Date.now(), text, completed: false }]);
  return { todos, addTodo };
}`,
  },
  {
    path: "TodoList.tsx",
    content: `export default function TodoList() {
  const { todos, addTodo } = useTodo();
  return <div>{todos.map(t => <div key={t.id}>{t.text}</div>)}</div>;
}`,
  },
];

const context = formatCodeContext(mockFiles);
console.log("📁 生成的代码上下文:");
console.log("==========================================");
console.log(context);
console.log("==========================================");
console.log("\n✅ 上下文长度:", context.length, "字符");
console.log("✅ 包含文件数:", mockFiles.length, "个");

// 模拟第二次修改的场景
console.log("\n🔄 模拟第二次修改场景:");
console.log('用户请求: "Add a delete button to each todo item"');
console.log("\n📤 Coder Agent 会收到的上下文:");
console.log("- 用户新需求: Add a delete button to each todo item");
console.log("- 现有代码:", mockFiles.length, "个文件的完整内容");
console.log("- Coder可以看到useTodo.ts已有addTodo功能，会添加deleteTodo");
console.log("- Coder可以看到TodoList.tsx当前结构，会添加删除按钮");
