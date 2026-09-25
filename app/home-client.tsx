"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { UnifiedChat } from "@/components/unified-chat";
import { ChatSidebar, HomeLanding } from "@/components/chat";
import { HeaderClient } from "@/components/header-client";
import { handleSignOut } from "@/app/actions/auth";
import { useGenerationStore } from "@/stores/use-generation-store";
import { toast } from "sonner";

interface Project {
  id: string;
  name: string;
  description?: string | null;
  slug: string;
  createdAt: string;
  updatedAt: string;
  versionCount: number;
  latestDeploymentStatus?: string | null;
  activeDeployment?: {
    id: string;
    versionNumber: number;
    url: string;
  } | null;
  thread: {
    id: string;
    title: string;
    favorite?: boolean;
    createdAt: string;
    updatedAt: string;
  } | null;
}

interface User {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

interface HomeClientProps {
  user: User | null;
  initialProjectId?: string;
}

export function HomeClient({ user, initialProjectId }: HomeClientProps) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [showHomeLanding, setShowHomeLanding] = useState(!initialProjectId);
  const [initialMessage, setInitialMessage] = useState<string>();
  const [initialImages, setInitialImages] = useState<
    { dataUrl: string; mime_type: string }[] | undefined
  >();

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId),
    [projects, selectedProjectId],
  );

  const fetchProjects = useCallback(async () => {
    try {
      const response = await fetch("/api/projects");
      if (!response.ok) throw new Error("Failed to fetch projects");
      const data = await response.json();
      setProjects(data.projects || []);
      if (
        selectedProjectId &&
        !(data.projects || []).some(
          (project: Project) => project.id === selectedProjectId,
        )
      ) {
        setSelectedProjectId(undefined);
        setShowHomeLanding(true);
        router.replace("/");
      }
    } catch (error) {
      console.error("获取项目列表失败:", error);
      toast.error("获取项目列表失败，请稍后重试");
    } finally {
      setIsLoading(false);
    }
  }, [router, selectedProjectId]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const openProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    setShowHomeLanding(false);
    setInitialMessage(undefined);
    setInitialImages(undefined);
    router.push(`/projects/${projectId}`);
  };

  const showNewProject = () => {
    setSelectedProjectId(undefined);
    setShowHomeLanding(true);
    setInitialMessage(undefined);
    setInitialImages(undefined);
    router.push("/");
  };

  const handleHomeSubmit = async (
    message: string,
    images?: { dataUrl: string; mime_type: string }[],
  ) => {
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "新项目" }),
      });
      if (!response.ok) throw new Error("Failed to create project");
      const { project } = await response.json();
      setProjects((current) => [
        {
          ...project,
          versionCount: 0,
          activeDeployment: null,
          latestDeploymentStatus: null,
        },
        ...current,
      ]);
      setSelectedProjectId(project.id);
      setShowHomeLanding(false);
      setInitialMessage(message);
      setInitialImages(images);
      router.push(`/projects/${project.id}`);
    } catch (error) {
      console.error("创建项目失败:", error);
      toast.error("创建项目失败，请稍后重试");
    }
  };

  const archiveProject = async (projectId: string) => {
    setDeletingProjectId(projectId);
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to archive project");
      setProjects((current) =>
        current.filter((project) => project.id !== projectId),
      );
      if (selectedProjectId === projectId) showNewProject();
      toast.success("项目已归档");
    } catch (error) {
      console.error("归档项目失败:", error);
      toast.error("归档失败，请稍后重试");
    } finally {
      setDeletingProjectId(null);
    }
  };

  const updateProject = async (
    projectId: string,
    data: { name?: string; favorite?: boolean },
  ) => {
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to update project");
      const result = await response.json();
      setProjects((current) =>
        current.map((project) =>
          project.id === projectId
            ? {
                ...project,
                name: result.project.name,
                thread: result.project.thread,
              }
            : project,
        ),
      );
    } catch (error) {
      console.error("更新项目失败:", error);
      toast.error("操作失败，请稍后重试");
    }
  };

  const sidebarProjects = projects.map((project) => ({
    id: project.id,
    title: project.name,
    favorite: project.thread?.favorite,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    published: !!project.activeDeployment,
    artifact: { _count: { versions: project.versionCount } },
  }));

  const onSignOut = async () => {
    useGenerationStore.getState().reset();
    await handleSignOut();
  };

  return (
    <div className="h-screen flex bg-gray-50 overflow-hidden">
      <div
        className={`transition-all duration-300 ${
          sidebarOpen ? "w-80" : "w-0"
        } overflow-hidden flex flex-col absolute md:static z-20 h-full md:h-auto`}
      >
        <ChatSidebar
          threads={sidebarProjects}
          selectedThreadId={selectedProjectId}
          isLoading={isLoading}
          showingHome={showHomeLanding}
          onThreadSelect={openProject}
          onNewThread={showNewProject}
          onHomeClick={showNewProject}
          onDeleteThread={archiveProject}
          onRenameThread={(id, name) => updateProject(id, { name })}
          onToggleFavorite={(id, favorite) =>
            updateProject(id, { favorite })
          }
          deletingThreadId={deletingProjectId}
        />
      </div>

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-10 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <HeaderClient
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          title={selectedProject?.name || "Prompt Web"}
          user={user}
          handleSignOut={onSignOut}
        />
        <div className="flex-1 overflow-hidden">
          {showHomeLanding || !selectedProject?.thread ? (
            <HomeLanding onSubmit={handleHomeSubmit} />
          ) : (
            <UnifiedChat
              key={selectedProject.id}
              projectId={selectedProject.id}
              threadId={selectedProject.thread.id}
              onThreadUpdate={fetchProjects}
              initialMessage={initialMessage}
              initialImages={initialImages}
            />
          )}
        </div>
      </div>
    </div>
  );
}
