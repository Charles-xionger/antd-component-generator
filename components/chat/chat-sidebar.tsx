"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Trash2,
  Edit,
  Star,
} from "lucide-react";

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

interface ChatSidebarProps {
  threads: Thread[];
  selectedThreadId?: string;
  isLoading?: boolean;
  onThreadSelect: (threadId: string) => void;
  onNewThread: () => void;
  onDeleteThread: (threadId: string) => void;
  onRenameThread: (threadId: string, newTitle: string) => void;
  onToggleFavorite: (threadId: string, favorite: boolean) => void;
  deletingThreadId?: string | null;
}

export function ChatSidebar({
  threads,
  selectedThreadId,
  isLoading = false,
  onThreadSelect,
  onNewThread,
  onDeleteThread,
  onRenameThread,
  onToggleFavorite,
  deletingThreadId,
}: ChatSidebarProps) {
  const [isFavoriteOpen, setIsFavoriteOpen] = useState(true);
  const [isRecentOpen, setIsRecentOpen] = useState(true);

  // 分离收藏和非收藏的会话
  const favoriteThreads = threads.filter((thread) => thread.favorite);
  const recentThreads = threads.filter((thread) => !thread.favorite);

  return (
    <div className="h-full flex flex-col bg-background border-r">
      {/* New Chat Button */}
      <div className="p-4 border-b">
        <Button
          onClick={onNewThread}
          className="w-full justify-start gap-2"
          variant="default"
        >
          <Plus className="h-4 w-4" />
          新建会话
        </Button>
      </div>

      {/* Scrollable Area for both sections */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {/* Favorite Chats Section */}
          {favoriteThreads.length > 0 && (
            <Collapsible open={isFavoriteOpen} onOpenChange={setIsFavoriteOpen}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 hover:bg-accent hover:text-accent-foreground rounded-md transition-colors">
                {isFavoriteOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                <span className="text-sm font-medium">收藏</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {favoriteThreads.length}
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1">
                <div className="space-y-1">
                  {favoriteThreads.map((thread) => (
                    <ChatItem
                      key={thread.id}
                      thread={thread}
                      isSelected={selectedThreadId === thread.id}
                      isDeleting={deletingThreadId === thread.id}
                      onSelect={() => onThreadSelect(thread.id)}
                      onDelete={() => onDeleteThread(thread.id)}
                      onRename={(newTitle) =>
                        onRenameThread(thread.id, newTitle)
                      }
                      onToggleFavorite={(favorite) =>
                        onToggleFavorite(thread.id, favorite)
                      }
                    />
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Recent Chats Collapsible Section */}
          <Collapsible open={isRecentOpen} onOpenChange={setIsRecentOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 hover:bg-accent hover:text-accent-foreground rounded-md transition-colors">
              {isRecentOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              <span className="text-sm font-medium">近期会话</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {recentThreads.length}
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1">
              {isLoading ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  加载中...
                </div>
              ) : recentThreads.length === 0 ? (
                <div className="p-4 text-center">
                  <div className="text-sm text-muted-foreground mb-1">
                    暂无会话
                  </div>
                  <div className="text-xs text-muted-foreground">
                    点击新建会话开始
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  {recentThreads.map((thread) => (
                    <ChatItem
                      key={thread.id}
                      thread={thread}
                      isSelected={selectedThreadId === thread.id}
                      isDeleting={deletingThreadId === thread.id}
                      onSelect={() => onThreadSelect(thread.id)}
                      onDelete={() => onDeleteThread(thread.id)}
                      onRename={(newTitle) =>
                        onRenameThread(thread.id, newTitle)
                      }
                      onToggleFavorite={(favorite) =>
                        onToggleFavorite(thread.id, favorite)
                      }
                    />
                  ))}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </ScrollArea>
    </div>
  );
}

interface ChatItemProps {
  thread: Thread;
  isSelected: boolean;
  isDeleting: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (newTitle: string) => void;
  onToggleFavorite: (favorite: boolean) => void;
}

function ChatItem({
  thread,
  isSelected,
  isDeleting,
  onSelect,
  onDelete,
  onRename,
  onToggleFavorite,
}: ChatItemProps) {
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState(thread.title);

  const handleRename = () => {
    if (newTitle.trim() && newTitle !== thread.title) {
      onRename(newTitle.trim());
    }
    setRenameDialogOpen(false);
  };

  const handleToggleFavorite = () => {
    onToggleFavorite(!thread.favorite);
  };

  return (
    <>
      <div
        className={`group relative rounded-md transition-colors ${
          isSelected
            ? "bg-accent text-accent-foreground"
            : "hover:bg-accent/50 hover:text-accent-foreground"
        }`}
      >
        <div
          onClick={onSelect}
          className="flex items-center justify-between p-2 cursor-pointer"
        >
          <div className="flex-1 min-w-0 mr-2">
            <div className="font-medium text-sm truncate">{thread.title}</div>
          </div>

          {/* More Options Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setNewTitle(thread.title);
                  setRenameDialogOpen(true);
                }}
              >
                <Edit className="mr-2 h-4 w-4" />
                重命名
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleFavorite();
                }}
              >
                <Star
                  className={`mr-2 h-4 w-4 ${
                    thread.favorite ? "fill-yellow-400 text-yellow-400" : ""
                  }`}
                />
                {thread.favorite ? "取消收藏" : "收藏"}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteDialogOpen(true);
                }}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    删除中...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    删除
                  </>
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名会话</DialogTitle>
            <DialogDescription>为该会话输入一个新名称</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="title" className="mb-2 block">
              会话名称
            </Label>
            <Input
              id="title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleRename();
                }
              }}
              placeholder="请输入会话名称"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRenameDialogOpen(false)}
            >
              取消
            </Button>
            <Button onClick={handleRename}>确认</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除会话</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除这个会话吗？删除后将无法恢复，包括所有聊天记录和生成的代码。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDelete();
                setDeleteDialogOpen(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
