"use client";

import { handleSignIn } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Github, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

const GridBackground = () => (
  <div className="absolute inset-0 -z-10 overflow-hidden">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(17,24,39,0.03),transparent)] dark:bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.03),transparent)]" />
    <svg
      className="absolute left-[50%] top-0 h-[100%] w-[200%] -translate-x-[50%] stroke-gray-200/30 [mask-image:radial-gradient(100%_100%_at_top_center,white,transparent)] dark:stroke-gray-800/30"
      aria-hidden="true"
    >
      <defs>
        <pattern
          id="grid"
          width="40"
          height="40"
          patternUnits="userSpaceOnUse"
          x="50%"
          y="-1"
        >
          <path d="M.5 40V.5H40" fill="none" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" strokeWidth="0" fill="url(#grid)" />
    </svg>
  </div>
);

const FloatingIcon = () => (
  <motion.div
    initial={{ y: 0 }}
    animate={{ y: [-5, 5, -5] }}
    transition={{
      duration: 2,
      repeat: Infinity,
      ease: "easeInOut",
    }}
    className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 shadow-xl shadow-primary/5"
  >
    <Sparkles className="h-10 w-10 text-primary" />
  </motion.div>
);

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background">
      <GridBackground />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="z-10 w-full max-w-md px-4"
      >
        <div className="rounded-3xl border border-border bg-card/40 p-8 shadow-2xl backdrop-blur-md md:p-12">
          <div className="text-center">
            <FloatingIcon />
            <h1 className="bg-gradient-to-b from-gray-900 to-gray-600 bg-clip-text text-3xl font-bold tracking-tight text-transparent dark:from-white dark:to-gray-400">
              Antd Component Generator
            </h1>
            <p className="mt-4 text-sm text-muted-foreground">
              使用智能助手快速生成、预览和部署你的 Ant Design 组件
            </p>
          </div>

          <form action={handleSignIn} className="mt-10">
            <Button
              type="submit"
              className="group relative h-12 w-full overflow-hidden rounded-xl bg-primary text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/25"
            >
              <motion.div
                className="flex items-center justify-center gap-3"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 10 }}
              >
                <Github className="h-5 w-5" />
                <span className="font-semibold">使用 GitHub 账号登录</span>
              </motion.div>
            </Button>
          </form>

          <div className="mt-8 flex items-center justify-center gap-4">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Secure Login
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <p className="mt-8 text-center text-xs text-muted-foreground/60">
            登录即表示您同意我们的
            <a
              href="#"
              className="mx-1 underline underline-offset-4 transition-colors hover:text-primary"
            >
              服务条款
            </a>
            和
            <a
              href="#"
              className="mx-1 underline underline-offset-4 transition-colors hover:text-primary"
            >
              隐私政策
            </a>
          </p>
        </div>

        {/* Decorative elements */}
        <div className="mt-12 flex justify-center gap-8 opacity-50 grayscale transition-all hover:opacity-100 hover:grayscale-0">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-blue-500" />
            <span className="text-xs font-medium text-muted-foreground">
              React 19
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-cyan-500" />
            <span className="text-xs font-medium text-muted-foreground">
              Tailwind 4
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-red-500" />
            <span className="text-xs font-medium text-muted-foreground">
              Ant Design
            </span>
          </div>
        </div>
      </motion.div>

      {/* Background Glows */}
      <div className="absolute left-1/2 top-1/2 -z-10 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[120px]" />
    </div>
  );
}
