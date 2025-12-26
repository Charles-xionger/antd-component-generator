// test/version-evolution-test.js

// 测试新的版本演进交互逻辑
console.log("🧪 版本演进交互逻辑测试");
console.log("==========================================");

// 模拟当前版本的文件
const currentVersionFiles = [
  {
    path: "App.tsx",
    content: `export default function App() {
  return (
    <div className="min-h-screen w-full bg-gray-50 p-4">
      <TodoList />
    </div>
  );
}`,
  },
  {
    path: "useTodo.ts",
    content: `export function useTodo() {
  const [todos, setTodos] = useState([]);
  
  const addTodo = (text: string) => {
    setTodos(prev => [...prev, { id: Date.now(), text, completed: false }]);
  };
  
  return { todos, addTodo };
}`,
  },
  {
    path: "TodoList.tsx",
    content: `export default function TodoList() {
  const { todos, addTodo } = useTodo();
  
  return (
    <div className="w-full space-y-4">
      {todos.map(todo => (
        <div key={todo.id} className="flex items-center space-x-2">
          <span>{todo.text}</span>
        </div>
      ))}
    </div>
  );
}`,
  },
];

// 模拟AI返回的修改（只修改需要的文件）
const aiModifications = [
  {
    path: "useTodo.ts",
    content: `export function useTodo() {
  const [todos, setTodos] = useState([]);
  
  const addTodo = (text: string) => {
    setTodos(prev => [...prev, { id: Date.now(), text, completed: false }]);
  };
  
  const deleteTodo = (id: number) => {
    setTodos(prev => prev.filter(todo => todo.id !== id));
  };
  
  return { todos, addTodo, deleteTodo };
}`,
  },
  {
    path: "TodoList.tsx",
    content: `export default function TodoList() {
  const { todos, addTodo, deleteTodo } = useTodo();
  
  return (
    <div className="w-full space-y-4">
      {todos.map(todo => (
        <div key={todo.id} className="flex items-center space-x-2">
          <span>{todo.text}</span>
          <button onClick={() => deleteTodo(todo.id)}>删除</button>
        </div>
      ))}
    </div>
  );
}`,
  },
];

// 模拟交互流程
function simulateVersionEvolution() {
  console.log("\n📋 用户请求: '添加删除功能'");
  console.log("\n🎯 步骤1：展示当前基准版本");
  console.log("Files shown to user:");
  currentVersionFiles.forEach((file) => {
    console.log(`  - ${file.path} (${file.content.length} chars)`);
  });

  console.log("\n⏳ 等待1.2秒后...");

  setTimeout(() => {
    console.log("\n✅ 步骤2：应用AI修改");
    console.log("Modified files:");
    aiModifications.forEach((file) => {
      console.log(`  - ${file.path} (updated)`);
    });

    console.log("\n📦 最终新版本包含:");
    const finalFiles = new Map();

    // 添加所有基准文件
    currentVersionFiles.forEach((file) => {
      finalFiles.set(file.path, file);
    });

    // 应用修改
    aiModifications.forEach((file) => {
      finalFiles.set(file.path, file);
    });

    Array.from(finalFiles.values()).forEach((file) => {
      const isModified = aiModifications.some((mod) => mod.path === file.path);
      console.log(
        `  - ${file.path} ${isModified ? "(🔄 modified)" : "(📋 unchanged)"}`
      );
    });

    console.log("\n🎉 版本演进完成！用户能清楚看到:");
    console.log("  1. 修改基于哪个版本");
    console.log("  2. 具体修改了哪些文件");
    console.log("  3. 哪些文件保持不变");
    console.log("  4. 完整的新版本内容");
  }, 1200);
}

simulateVersionEvolution();

console.log("\n💡 优化后的交互逻辑:");
console.log("  - 先显示基准版本，让用户看到修改起点");
console.log("  - 延迟应用修改，形成平滑的版本演进过程");
console.log("  - 保留未修改文件，确保完整性");
console.log("  - 明确标识修改内容，提供清晰的变更追踪");
