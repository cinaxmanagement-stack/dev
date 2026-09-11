import { useCallback, useEffect, useState } from "react";
import {
  Plus, FolderGit2, Brain, Bot, Github, Settings as SettingsIcon, ListTodo, LogOut, Sparkles,
  AlertTriangle,
} from "lucide-react";
import devstudio from "@/lib/devstudio";
import { toast } from "@/lib/toast";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { statusDotClass, formatStatusLabel } from "@/lib/status";
import type { Project, Branch, Task } from "@/lib/types";
import TaskView from "./TaskView";
import { RepoBrowser, MemoryPanel, AgentsPanel, GitHubPanel, SettingsPanel } from "./panels";
import { NewProjectDialog, NewTaskDialog } from "./dialogs";

type View = "task" | "repo" | "memory" | "agents" | "github" | "settings";

function BalanceBanner() {
  const [health, setHealth] = useState<any>(null);
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const { data } = await devstudio.providerHealth("emergent");
        if (alive) setHealth(data);
      } catch {
        /* ignore */
      }
    };
    check();
    const t = setInterval(check, 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const banner = health && health.configured && ["insufficient_credit", "auth_error"].includes(health.status);
  if (!banner) return null;
  const isCredit = health.status === "insufficient_credit";
  return (
    <div
      data-testid="universal-key-banner"
      className={`flex items-center gap-2.5 px-4 py-2 text-xs border-b flex-shrink-0 ${
        isCredit ? "bg-amber-500/15 border-amber-500/30 text-amber-100"
                 : "bg-red-500/15 border-red-500/30 text-red-100"
      }`}
    >
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <span className="font-medium">
        {isCredit ? "Emergent Universal Key is out of runtime balance." : "Emergent Universal Key authentication failed."}
      </span>
      <span className="text-white/70 truncate">{health.detail}</span>
      {isCredit && (
        <span className="ml-auto text-white/80 whitespace-nowrap">
          Add balance: Profile → Manage plan → Universal Key → Add Balance
        </span>
      )}
    </div>
  );
}

const NAV_ITEMS = [
  ["repo", FolderGit2, "Repository"],
  ["memory", Brain, "Project Memory"],
  ["agents", Bot, "Agents"],
  ["github", Github, "GitHub"],
  ["settings", SettingsIcon, "Settings"],
] as const;

export default function DevStudioApp() {
  const { logout } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branch, setBranch] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [view, setView] = useState<View>("task");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshProjects = useCallback(async () => {
    try {
      const { data } = await devstudio.listProjects();
      setProjects(data.projects);
      setProjectId((prev) => prev ?? data.projects[0]?.id ?? null);
    } catch {
      /* nothing connected yet */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  const refreshTasks = useCallback(async (pid: string | null) => {
    if (!pid) return;
    try {
      const { data } = await devstudio.listTasks(pid);
      setTasks(data.tasks);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Could not load tasks");
    }
  }, []);

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      try {
        const { data } = await devstudio.projectBranches(projectId);
        setBranches(data.branches);
        const project = projects.find((p) => p.id === projectId);
        setBranch(project?.default_branch || data.branches?.[0]?.name || null);
      } catch (e: any) {
        toast.error(e?.response?.data?.detail || "Could not load branches");
      }
      refreshTasks(projectId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleCreateTask(fields: { title: string; request_text: string; mode: string }) {
    if (!projectId || !branch) return;
    try {
      const { data } = await devstudio.createTask({
        project_id: projectId, branch, model_preset: "BALANCED", ...fields,
      });
      toast.success("Task created");
      setNewTaskOpen(false);
      await refreshTasks(projectId);
      setTaskId(data.id);
      setView("task");
      await devstudio.runTask(data.id);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Could not create task");
    }
  }

  const currentProject = projects.find((p) => p.id === projectId);

  return (
    <div className="h-screen w-screen flex flex-col bg-surface-0 text-white overflow-hidden">
      <BalanceBanner />
      <div className="flex flex-1 min-h-0">
      {/* LEFT SIDEBAR */}
      <aside className="w-72 flex-shrink-0 flex flex-col border-r border-white/10 bg-surface-1">
        <div className="h-14 flex items-center gap-2.5 px-4 border-b border-white/10 flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 via-fuchsia-500 to-amber-400 shadow-glow flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-white" strokeWidth={2.25} />
          </div>
          <span className="font-semibold text-sm tracking-tight">Zanelvo Dev Studio</span>
        </div>

        <div className="p-3 space-y-2 border-b border-white/10">
          <div className="flex items-center gap-1.5">
            <Select
              value={projectId ?? ""}
              onChange={(e) => {
                setProjectId(e.target.value || null);
                setTaskId(null);
              }}
              placeholder={loading ? "Loading…" : "Select repository"}
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
            />
            <Button size="icon" variant="ghost" onClick={() => setNewProjectOpen(true)} title="Connect a repository">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          {projectId && (
            <Select
              value={branch ?? ""}
              onChange={(e) => setBranch(e.target.value || null)}
              placeholder="Select branch"
              options={branches.map((b) => ({ value: b.name, label: b.name }))}
            />
          )}
          <Button className="w-full" disabled={!projectId || !branch} onClick={() => setNewTaskOpen(true)}>
            <Plus className="w-3.5 h-3.5" /> New Task
          </Button>
        </div>

        <div className="px-3.5 pt-3 pb-1.5 text-[10px] font-medium uppercase tracking-widest text-white/35 flex-shrink-0">
          Tasks
        </div>
        <div className="flex-1 overflow-y-auto px-2 min-h-0">
          {loading && <SkeletonRows count={3} className="px-1" />}
          {!loading && (
            <div className="space-y-0.5 pb-2">
              {tasks.map((t) => {
                const active = taskId === t.id && view === "task";
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setTaskId(t.id);
                      setView("task");
                    }}
                    className={`w-full text-left pl-2.5 pr-2 py-2 rounded-lg text-xs flex items-start gap-2 transition-colors border-l-2 ${
                      active
                        ? "bg-white/[0.08] text-white border-indigo-400"
                        : "text-white/60 hover:bg-white/[0.04] hover:text-white/90 border-transparent"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 mt-1.5 flex-shrink-0 rounded-full ${statusDotClass(t.status)}`} />
                    <span className="flex-1 min-w-0">
                      <div className="truncate leading-snug">{t.title}</div>
                      <div className="text-[10px] text-white/35 mt-0.5 capitalize">{formatStatusLabel(t.status)}</div>
                    </span>
                  </button>
                );
              })}
              {!tasks.length && projectId && (
                <EmptyState compact icon={ListTodo} title="No tasks yet" description="Create one to get started." />
              )}
            </div>
          )}
        </div>

        <nav className="border-t border-white/10 p-2 space-y-0.5 flex-shrink-0">
          {NAV_ITEMS.map(([key, Icon, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`w-full flex items-center gap-2 pl-2.5 pr-2 py-1.5 rounded-lg text-xs transition-colors border-l-2 ${
                view === key
                  ? "bg-white/[0.08] text-white border-indigo-400"
                  : "text-white/50 hover:bg-white/[0.04] hover:text-white/90 border-transparent"
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-white/10 text-[11px] text-white/40 flex items-center justify-between flex-shrink-0">
          {currentProject?.last_indexed_commit_sha ? (
            <Badge className="border-white/15 text-white/50 font-mono">
              {currentProject.last_indexed_commit_sha.slice(0, 7)}
            </Badge>
          ) : (
            <span />
          )}
          <button onClick={logout} className="flex items-center gap-1 hover:text-white transition-colors">
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      </aside>

      {/* CENTER + RIGHT */}
      <div className="flex-1 min-w-0 flex flex-col">
        {view === "task" && taskId && <TaskView taskId={taskId} onTaskChanged={() => refreshTasks(projectId)} />}
        {view === "task" && !taskId && (
          <div className="flex-1 grid place-items-center">
            <EmptyState
              icon={ListTodo}
              title={projectId ? "No task selected" : "Connect a repository to begin"}
              description={
                projectId
                  ? "Select a task from the sidebar, or create a new one."
                  : "Zanelvo Dev Studio needs a GitHub repository to analyze, plan against, and edit."
              }
              action={
                !projectId ? (
                  <Button size="sm" onClick={() => setNewProjectOpen(true)}>
                    <Plus className="w-3.5 h-3.5" /> Connect a repository
                  </Button>
                ) : undefined
              }
            />
          </div>
        )}
        {view === "repo" && projectId && branch && <RepoBrowser projectId={projectId} branch={branch} />}
        {view === "memory" && projectId && <MemoryPanel projectId={projectId} />}
        {view === "agents" && <AgentsPanel />}
        {view === "github" && <GitHubPanel />}
        {view === "settings" && <SettingsPanel />}
      </div>
      </div>

      <NewProjectDialog
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
        onCreated={() => {
          setNewProjectOpen(false);
          refreshProjects();
        }}
      />
      <NewTaskDialog open={newTaskOpen} onOpenChange={setNewTaskOpen} onSubmit={handleCreateTask} />
    </div>
  );
}
