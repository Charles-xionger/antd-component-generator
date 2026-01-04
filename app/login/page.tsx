import { signIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Github } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="w-full max-w-md space-y-8 rounded-2xl bg-card p-10 shadow-2xl">
        <div className="text-center">
          <div className="mb-4 text-6xl">🤖</div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            欢迎回来
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            使用 GitHub 账号登录以继续
          </p>
        </div>

        <form
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: "/" });
          }}
          className="mt-8"
        >
          <Button
            type="submit"
            className="w-full flex items-center justify-center gap-3 bg-primary text-primary-foreground hover:bg-primary/90"
            size="lg"
          >
            <Github className="h-5 w-5" />
            使用 GitHub 登录
          </Button>
        </form>

        <div className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
          登录即表示您同意我们的服务条款和隐私政策
        </div>
      </div>
    </div>
  );
}
