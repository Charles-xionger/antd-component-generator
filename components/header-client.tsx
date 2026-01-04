"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, User as UserIcon } from "lucide-react";

interface User {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

interface HeaderClientProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  title: string;
  user: User | null;
  handleSignOut: () => Promise<void>;
}

export function HeaderClient({
  sidebarOpen,
  onToggleSidebar,
  title,
  user,
  handleSignOut,
}: HeaderClientProps) {
  return (
    <div className="bg-background border-b border-border px-4 py-3 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-2 hover:bg-accent rounded-lg transition-colors md:hidden lg:block"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={
                sidebarOpen
                  ? "M11 19l-7-7 7-7M2 12h12"
                  : "M4 6h16M4 12h16M4 18h16"
              }
            />
          </svg>
        </button>
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      </div>

      {/* 用户菜单 */}
      <div className="flex items-center gap-3">
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 p-1.5 hover:bg-accent rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring">
                {user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.image}
                    alt={user.name || "User"}
                    width={32}
                    height={32}
                    className="rounded-full"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                    <UserIcon className="h-4 w-4" />
                  </div>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer"
                onSelect={async (e) => {
                  e.preventDefault();
                  await handleSignOut();
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                登出
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* 移动端菜单按钮 */}
        <button
          onClick={onToggleSidebar}
          className="p-2 hover:bg-accent rounded-lg transition-colors md:hidden"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
