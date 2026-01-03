interface Thread {
  id: string;
  title: string;
  favorite?: boolean;
  createdAt: string;
  updatedAt: string;
  artifact?: {
    _count: {
      versions: number;
    };
  };
}

interface HeaderProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  selectedThreadId?: string;
  threads: Thread[];
}

export function Header({
  sidebarOpen,
  onToggleSidebar,
  selectedThreadId,
  threads,
}: HeaderProps) {
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
        <h1 className="text-lg font-semibold text-foreground">
          {selectedThreadId
            ? threads.find((t) => t.id === selectedThreadId)?.title || "会话"
            : "Next LangGraph Demo"}
        </h1>
      </div>

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
  );
}
