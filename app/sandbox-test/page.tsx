// app/sandbox-test/page.tsx
import { SandboxTest } from "@/components/sandbox-test";

export default function SandboxTestPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto py-8">
        <h1 className="text-2xl font-bold mb-8">沙箱测试页面</h1>
        <SandboxTest />
      </div>
    </div>
  );
}
