import { useEffect, useState } from "react";
import {
  Folder, File as FileIcon, Search, CheckCircle2, AlertTriangle, XCircle, RefreshCw, FolderGit2,
  Brain, Bot, Github, Settings as SettingsIcon, ChevronRight, ArrowUp, FileCode2, BrainCircuit,
  KeyRound, FlaskConical,
} from "lucide-react";
import devstudio from "@/lib/devstudio";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import type { MemoryItem } from "@/lib/types";

// --- Repository browser ---------------------------------------------------------------

export function RepoBrowser({ projectId, branch }: { projectId: string; branch: string }) {
  const [entries, setEntries] = useState<any[]>([]);
  const [subdir, setSubdir] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState("");

  useEffect(() => {
    devstudio
      .tree(projectId, branch, subdir)
      .then(({ data }) => setEntries(data.entries))
      .catch((e: any) => toast.error(e?.response?.data?.detail || "Could not load tree"));
  }, [projectId, branch, subdir]);

  async function openFile(path: string) {
    setSelected(path);
    try {
      const { data } = await devstudio.readFile(projectId, branch, path);
      setContent(data.content);
    } catch (e: any) {
      setContent(`<< ${e?.response?.data?.detail || "could not read file"} >>`);
    }
  }

  async function doSearch() {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    const { data } = await devstudio.search(projectId, branch, query);
    setResults(data.results);
  }

  const rows = results ?? entries;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <PageHeader icon={FolderGit2} title="Repository" description={`branch ${branch}`} />
      <div className="flex-1 flex min-h-0">
        <div className="w-72 border-r border-white/10 flex flex-col flex-shrink-0">
          <div className="p-2 border-b border-white/10 flex gap-1">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              placeholder="Search code…"
            />
            <Button size="icon" variant="ghost" onClick={doSearch}>
              <Search className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-1">
            {subdir && !results && (
              <button
                className="w-full flex items-center gap-1.5 text-left px-2 py-1 text-xs text-white/45 hover:bg-white/[0.05] hover:text-white/70 rounded transition-colors"
                onClick={() => setSubdir(subdir.split("/").slice(0, -1).join("/"))}
              >
                <ArrowUp className="w-3.5 h-3.5" /> ..
              </button>
            )}
            {rows.map((e) => (
              <button
                key={e.path}
                onClick={() => (e.is_dir ? setSubdir(e.path) : openFile(e.path))}
                className={`w-full flex items-center gap-1.5 text-left px-2 py-1 text-xs rounded transition-colors ${
                  selected === e.path ? "bg-white/[0.09] text-white" : "text-white/65 hover:bg-white/[0.05] hover:text-white/90"
                }`}
              >
                {e.is_dir ? (
                  <Folder className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                ) : (
                  <FileIcon className="w-3.5 h-3.5 text-white/35 flex-shrink-0" />
                )}
                <span className="truncate">{e.path.split("/").pop()}</span>
                {e.line && <span className="text-white/30 ml-auto flex-shrink-0">:{e.line}</span>}
              </button>
            ))}
            {!rows.length && (
              <EmptyState compact icon={Search} title={results ? "No matches" : "Empty directory"} />
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {content ? (
            <pre className="p-4 text-xs text-white/80 whitespace-pre-wrap font-mono leading-relaxed">{content}</pre>
          ) : (
            <EmptyState icon={FileCode2} title="No file open" description="Select a file from the tree to view its contents." />
          )}
        </div>
      </div>
    </div>
  );
}

// --- Project memory --------------------------------------------------------------------

export function MemoryPanel({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<MemoryItem[]>([]);

  async function load() {
    const { data } = await devstudio.listMemory(projectId);
    setItems(data.memory);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <PageHeader icon={Brain} title="Project Memory" description="Accumulates automatically as tasks run" />
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-3xl mx-auto space-y-2.5">
          {items.map((m) => (
            <div key={m.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3 hover:border-white/15 transition-colors">
              <div className="flex items-center gap-2 mb-1.5">
                <Badge tone="brand">{m.category}</Badge>
                {m.stale && <Badge tone="warning" dot>stale</Badge>}
                <span className="text-xs font-medium text-white/85">{m.title}</span>
              </div>
              <div className="text-xs text-white/55 whitespace-pre-wrap leading-relaxed">{m.content}</div>
            </div>
          ))}
          {!items.length && (
            <EmptyState icon={BrainCircuit} title="No memory recorded yet" description="It accumulates as tasks run — decisions, gotchas, and context worth remembering across sessions." />
          )}
        </div>
      </div>
    </div>
  );
}

// --- Agents config -----------------------------------------------------------------------

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  gemini: "Gemini",
  gemini_enterprise: "Gemini Enterprise Agent Platform",
  bedrock: "Amazon Bedrock",
  emergent: "Emergent",
};

const EDITABLE_FIELDS = [
  "enabled", "primary_provider", "primary_model", "fallback_provider", "fallback_model",
  "reasoning_level", "max_attempts", "automatic_fallback",
] as const;

type ModelInfo = { id: string; provider: string; label: string };
type AgentDraft = {
  enabled: boolean;
  primary_provider: string;
  primary_model: string;
  fallback_provider: string | null;
  fallback_model: string | null;
  reasoning_level: string | null;
  max_attempts: number;
  automatic_fallback: boolean;
};

const PRESETS = ["ECONOMICAL", "BALANCED", "MAX_QUALITY"] as const;

export function AgentsPanel() {
  const [agents, setAgents] = useState<Record<string, AgentDraft>>({});
  const [drafts, setDrafts] = useState<Record<string, AgentDraft>>({});
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, ModelInfo[]>>({});
  const [providers, setProviders] = useState<string[]>([]);
  const [savingRole, setSavingRole] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  async function load() {
    const [{ data: agentData }, { data: modelData }] = await Promise.all([
      devstudio.agentConfigs(),
      devstudio.providerModels(),
    ]);
    setAgents(agentData.agents);
    setDrafts(Object.fromEntries(Object.entries(agentData.agents).map(([r, c]) => [r, { ...(c as AgentDraft) }])));
    setModelsByProvider(modelData.models);
    setProviders(modelData.providers);
  }
  useEffect(() => {
    load();
  }, []);

  async function applyPreset(preset: string) {
    const { data } = await devstudio.applyPreset(preset);
    setAgents(data.agents);
    setDrafts(Object.fromEntries(Object.entries(data.agents).map(([r, c]) => [r, { ...(c as AgentDraft) }])));
    toast.success(`Applied ${preset} preset to all agents`);
  }

  function setField<K extends keyof AgentDraft>(role: string, field: K, value: AgentDraft[K]) {
    setDrafts((d) => ({ ...d, [role]: { ...d[role], [field]: value } }));
  }

  function isDirty(role: string): boolean {
    const a = agents[role], d = drafts[role];
    if (!a || !d) return false;
    return EDITABLE_FIELDS.some((k) => (a[k] ?? null) !== (d[k] ?? null));
  }

  function toggleExpanded(role: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  }

  async function save(role: string) {
    setSavingRole(role);
    try {
      const d = drafts[role];
      const { data } = await devstudio.updateAgentConfig(role, {
        enabled: d.enabled,
        primary_provider: d.primary_provider,
        primary_model: d.primary_model,
        fallback_provider: d.fallback_provider || null,
        fallback_model: d.fallback_model || null,
        reasoning_level: d.reasoning_level || null,
        max_attempts: d.max_attempts,
        automatic_fallback: d.automatic_fallback,
      });
      setAgents((a) => ({ ...a, [role]: data }));
      setDrafts((dr) => ({ ...dr, [role]: { ...data } }));
      toast.success(`Saved ${role.replace(/_/g, " ")}`);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Could not save agent config");
    } finally {
      setSavingRole(null);
    }
  }

  function modelOptions(provider: string) {
    const models = modelsByProvider[provider] || [];
    if (!models.length) return [{ value: "", label: "(no models)" }];
    return models.map((m) => ({ value: m.id, label: m.label }));
  }

  const providerOptions = providers.map((p) => ({ value: p, label: PROVIDER_LABELS[p] || p }));

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <PageHeader
        icon={Bot}
        title="Agents"
        description="Model routing per role"
        actions={
          <div className="flex gap-1.5">
            {PRESETS.map((p) => (
              <Button key={p} size="sm" variant="outline" onClick={() => applyPreset(p)}>
                {p}
              </Button>
            ))}
          </div>
        }
      />
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-3xl mx-auto space-y-2.5">
          <div className="text-[11px] text-white/40 -mt-1 mb-1">
            Presets set every role at once. Expand a role to override it individually — including
            its fallback — without leaving the preset for everything else.
          </div>
          {Object.entries(drafts).map(([role, cfg]) => {
            const isOpen = expanded.has(role);
            const dirty = isDirty(role);
            return (
              <div key={role} className="rounded-lg border border-white/10 bg-white/[0.03] overflow-hidden transition-colors hover:border-white/15">
                <button
                  onClick={() => toggleExpanded(role)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
                >
                  <ChevronRight className={`w-3.5 h-3.5 text-white/35 flex-shrink-0 transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`} />
                  <span className="font-medium text-white/85 capitalize text-xs flex-shrink-0">{role.replace(/_/g, " ")}</span>
                  <span className="text-white/35 text-[11px] truncate min-w-0">
                    {cfg.primary_provider}/{cfg.primary_model || "—"}
                    {cfg.fallback_model && <span> → {cfg.fallback_provider}/{cfg.fallback_model}</span>}
                  </span>
                  <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
                    {dirty && <Badge tone="warning" dot>unsaved</Badge>}
                    {!cfg.enabled && <Badge tone="neutral">disabled</Badge>}
                  </div>
                </button>

                {isOpen && (
                  <div className="px-3 pb-3 pt-1 space-y-2.5 text-xs border-t border-white/[0.06] animate-fade-in">
                    <div className="flex items-center justify-end pt-2.5">
                      <label className="flex items-center gap-1.5 text-white/60 cursor-pointer">
                        <input type="checkbox" className="accent-indigo-500" checked={cfg.enabled}
                          onChange={(e) => setField(role, "enabled", e.target.checked)} />
                        enabled
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-white/40 mb-1">Primary provider</div>
                        <Select value={cfg.primary_provider} options={providerOptions}
                          onChange={(e) => {
                            const provider = e.target.value;
                            const firstModel = (modelsByProvider[provider] || [])[0]?.id || "";
                            setDrafts((d) => ({ ...d, [role]: { ...d[role], primary_provider: provider, primary_model: firstModel } }));
                          }} />
                      </div>
                      <div>
                        <div className="text-white/40 mb-1">Primary model</div>
                        <Select value={cfg.primary_model} options={modelOptions(cfg.primary_provider)}
                          onChange={(e) => setField(role, "primary_model", e.target.value)} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-white/40 mb-1">Fallback provider</div>
                        <Select value={cfg.fallback_provider || ""}
                          options={[{ value: "", label: "None" }, ...providerOptions]}
                          onChange={(e) => {
                            const provider = e.target.value;
                            const firstModel = provider ? (modelsByProvider[provider] || [])[0]?.id || "" : "";
                            setDrafts((d) => ({
                              ...d,
                              [role]: { ...d[role], fallback_provider: provider || null, fallback_model: firstModel || null },
                            }));
                          }} />
                      </div>
                      <div>
                        <div className="text-white/40 mb-1">Fallback model</div>
                        <Select value={cfg.fallback_model || ""} disabled={!cfg.fallback_provider}
                          options={cfg.fallback_provider ? modelOptions(cfg.fallback_provider) : [{ value: "", label: "—" }]}
                          onChange={(e) => setField(role, "fallback_model", e.target.value)} />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <div className="text-white/40 mb-1">Reasoning level</div>
                        <Select value={cfg.reasoning_level || ""}
                          options={[
                            { value: "", label: "none" }, { value: "low", label: "low" },
                            { value: "medium", label: "medium" }, { value: "high", label: "high" },
                          ]}
                          onChange={(e) => setField(role, "reasoning_level", e.target.value || null)} />
                      </div>
                      <div>
                        <div className="text-white/40 mb-1">Max attempts</div>
                        <Input type="number" min={1} max={5} value={cfg.max_attempts}
                          onChange={(e) => setField(role, "max_attempts", Number(e.target.value) || 1)} />
                      </div>
                      <div>
                        <div className="text-white/40 mb-1">Auto-fallback</div>
                        <label className="flex items-center gap-1.5 text-white/60 h-8 cursor-pointer">
                          <input type="checkbox" className="accent-indigo-500" checked={cfg.automatic_fallback}
                            onChange={(e) => setField(role, "automatic_fallback", e.target.checked)} />
                          on failure
                        </label>
                      </div>
                    </div>

                    <div className="flex items-center justify-end pt-1">
                      <Button size="sm" disabled={!dirty || savingRole === role} loading={savingRole === role} onClick={() => save(role)}>
                        Save
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// --- GitHub ------------------------------------------------------------------------------

export function GitHubPanel() {
  const [status, setStatus] = useState<any>(null);
  const [repos, setRepos] = useState<any[]>([]);
  const [reposError, setReposError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setReposError(null);
    try {
      const { data } = await devstudio.githubWhoami();
      setStatus(data);
      if (data.available) {
        try {
          const r = await devstudio.githubRepos();
          setRepos(r.data.repos);
        } catch (e: any) {
          // Connectivity can be fine while listing repos still fails (e.g. a token scoped to
          // specific repos rather than full account access) — surface it instead of going quiet.
          setRepos([]);
          setReposError(e?.response?.data?.detail || "Could not list repositories");
        }
      }
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <PageHeader
        icon={Github}
        title="GitHub"
        actions={
          <Button size="icon" variant="ghost" onClick={load} title="Refresh">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-3xl mx-auto space-y-4">
          <div className={`rounded-lg border p-3 flex items-center gap-2.5 ${
            status?.available ? "border-emerald-500/25 bg-emerald-500/[0.06]" : "border-amber-500/25 bg-amber-500/[0.06]"
          }`}>
            {status?.available ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            )}
            <span className="text-xs text-white/80">{status?.detail || "Checking…"}</span>
          </div>
          {!status?.available && (
            <div className="text-xs text-white/50">
              Configure a GitHub Personal Access Token in Settings to browse repositories, index code,
              and commit/push from Dev Studio.
            </div>
          )}
          {reposError && (
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3 text-xs text-amber-200">
              {reposError}
            </div>
          )}
          <div className="space-y-1.5">
            {repos.map((r) => (
              <div key={r.full_name} className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs flex items-center justify-between hover:border-white/15 transition-colors">
                <span className="text-white/80 flex items-center gap-2">
                  <Github className="w-3.5 h-3.5 text-white/35 flex-shrink-0" /> {r.full_name}
                </span>
                <Badge className="border-white/15 text-white/50 font-mono">{r.default_branch}</Badge>
              </div>
            ))}
          </div>
          {!loading && status?.available && !repos.length && !reposError && (
            <EmptyState icon={Github} title="No repositories visible" description="Your token may be scoped to specific repositories." />
          )}
        </div>
      </div>
    </div>
  );
}

// --- Settings ----------------------------------------------------------------------------

const SECRET_FIELDS: { key: string; label: string; placeholder: string; group: string; multiline?: boolean }[] = [
  { key: "github_pat", label: "GitHub Personal Access Token", placeholder: "ghp_…", group: "GitHub" },
  { key: "anthropic_api_key", label: "Anthropic API Key", placeholder: "sk-ant-…", group: "Native API keys" },
  { key: "openai_api_key", label: "OpenAI API Key", placeholder: "sk-…", group: "Native API keys" },
  { key: "gemini_api_key", label: "Gemini API Key", placeholder: "AIza…", group: "Native API keys" },
  { key: "emergent_universal_key", label: "Emergent Universal Key", placeholder: "sk-emergent-…", group: "Emergent" },
  { key: "aws_access_key_id", label: "AWS Access Key ID", placeholder: "AKIA…", group: "Amazon Bedrock" },
  { key: "aws_secret_access_key", label: "AWS Secret Access Key", placeholder: "…", group: "Amazon Bedrock" },
  { key: "aws_session_token", label: "AWS Session Token (optional, for temporary credentials)", placeholder: "…", group: "Amazon Bedrock" },
  { key: "aws_region", label: "AWS Region", placeholder: "us-east-1", group: "Amazon Bedrock" },
  { key: "gcp_project_id", label: "GCP Project ID", placeholder: "my-project-123", group: "Gemini Enterprise Agent Platform" },
  { key: "gcp_location", label: "GCP Location", placeholder: "us-central1", group: "Gemini Enterprise Agent Platform" },
  { key: "gcp_service_account_json", label: "Service Account JSON (optional — paste the full key file contents)", placeholder: '{"type": "service_account", …}', group: "Gemini Enterprise Agent Platform", multiline: true },
];
const SECRET_GROUPS = ["GitHub", "Native API keys", "Amazon Bedrock", "Gemini Enterprise Agent Platform", "Emergent"];

type TestOutcome = "idle" | "testing" | "ok" | "error" | "not_configured" | "not_implemented";
type TestState = { state: TestOutcome; detail?: string; latency_ms?: number };

export function SettingsPanel() {
  const [caps, setCaps] = useState<any[]>([]);
  const [secretsConfigured, setSecretsConfigured] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [models, setModels] = useState<Record<string, { id: string; label: string }[]>>({});
  const [providers, setProviders] = useState<string[]>([]);
  const [testStatus, setTestStatus] = useState<Record<string, TestState>>({});

  async function load() {
    const { data } = await devstudio.capabilities();
    setCaps(data.capabilities);
    const s = await devstudio.getSettings();
    setSecretsConfigured(s.data.secrets_configured);
    const m = await devstudio.providerModels();
    setModels(m.data.models);
    setProviders(m.data.providers);
  }
  useEffect(() => {
    load();
  }, []);

  async function saveSecret(name: string) {
    const value = draft[name];
    if (!value) return;
    await devstudio.setSecret(name, value);
    toast.success("Saved. It is encrypted at rest and never shown again.");
    setDraft((d) => ({ ...d, [name]: "" }));
    load();
  }

  async function testModel(provider: string, model: string) {
    const key = `${provider}:${model}`;
    setTestStatus((t) => ({ ...t, [key]: { state: "testing" } }));
    try {
      const { data } = await devstudio.testProviderModel(provider, model);
      if (data.ok) {
        setTestStatus((t) => ({
          ...t,
          [key]: { state: "ok", detail: data.response_text, latency_ms: data.latency_ms },
        }));
      } else {
        setTestStatus((t) => ({
          ...t,
          [key]: { state: (data.error_type as TestOutcome) || "error", detail: data.detail, latency_ms: data.latency_ms },
        }));
      }
    } catch (e: any) {
      setTestStatus((t) => ({
        ...t,
        [key]: { state: "error", detail: e?.response?.data?.detail || "Request failed" },
      }));
    }
  }

  const configuredCount = Object.values(secretsConfigured).filter(Boolean).length;
  const availableCount = caps.filter((c) => c.available).length;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <PageHeader icon={SettingsIcon} title="Settings" />
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-2xl mx-auto">
          <Tabs defaultValue="capabilities">
            <TabsList className="mb-5">
              <TabsTrigger value="capabilities">
                capabilities {caps.length ? `(${availableCount}/${caps.length})` : ""}
              </TabsTrigger>
              <TabsTrigger value="secrets">secrets {configuredCount ? `(${configuredCount})` : ""}</TabsTrigger>
              <TabsTrigger value="test">test models</TabsTrigger>
            </TabsList>

            <TabsContent value="capabilities" className="space-y-1.5">
              {caps.map((c) => (
                <div key={c.name} className="flex items-center gap-2.5 text-xs rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
                  {c.available ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                  )}
                  <span className="text-white/75 w-44 flex-shrink-0 capitalize">{c.name.replace(/_/g, " ")}</span>
                  <span className="text-white/40 truncate">{c.detail || (c.available ? "available" : "unavailable")}</span>
                </div>
              ))}
              {!caps.length && <EmptyState compact icon={SettingsIcon} title="Loading capabilities…" />}
            </TabsContent>

            <TabsContent value="secrets" className="space-y-5">
              {SECRET_GROUPS.map((group) => (
                <div key={group} className="space-y-3">
                  <div className="text-[11px] uppercase tracking-wide text-white/40">{group}</div>
                  {group === "Amazon Bedrock" && (
                    <div className="text-[11px] text-white/40 -mt-1">
                      Access key/secret are optional — if left blank, Bedrock falls back to the
                      standard AWS default credential chain (environment variables, an EC2/ECS/Lambda
                      IAM role). A region is always required.
                    </div>
                  )}
                  {group === "Gemini Enterprise Agent Platform" && (
                    <div className="text-[11px] text-white/40 -mt-1">
                      The same Gemini models, routed through Google Cloud (formerly Vertex AI) for
                      GCP-native governance and data residency. Service account JSON is optional —
                      if left blank, it falls back to Google's Application Default Credentials
                      (gcloud login or an attached GCP service account). A project ID is always
                      required; location defaults to us-central1.
                    </div>
                  )}
                  {SECRET_FIELDS.filter((f) => f.group === group).map((f) => (
                    <div key={f.key}>
                      <label className="text-xs text-white/50">
                        {f.label}{" "}
                        {secretsConfigured[f.key] && (
                          <Badge tone="success" className="ml-1">configured</Badge>
                        )}
                      </label>
                      {f.multiline ? (
                        <div className="space-y-1.5 mt-1">
                          <Textarea rows={4} value={draft[f.key] || ""}
                            onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                            placeholder={f.placeholder} />
                          <Button size="sm" disabled={!draft[f.key]} onClick={() => saveSecret(f.key)}>Save</Button>
                        </div>
                      ) : (
                        <div className="flex gap-1.5 mt-1">
                          <Input type="password" value={draft[f.key] || ""}
                            onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                            placeholder={f.placeholder} />
                          <Button size="sm" disabled={!draft[f.key]} onClick={() => saveSecret(f.key)}>Save</Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
              <div className="flex items-start gap-1.5 text-[11px] text-white/40 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                <KeyRound className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>
                  Secrets are encrypted at rest and never re-displayed. Environment variables
                  (ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, DEVSTUDIO_GITHUB_TOKEN,
                  EMERGENT_UNIVERSAL_KEY, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
                  AWS_SESSION_TOKEN, AWS_REGION, GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION,
                  GOOGLE_APPLICATION_CREDENTIALS_JSON) override these if set.
                </span>
              </div>
            </TabsContent>

            <TabsContent value="test" className="space-y-4">
              <div className="text-[11px] text-white/40 flex items-start gap-1.5">
                <FlaskConical className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>
                  Makes one real, minimal request per click using whatever credentials are
                  currently saved in the Secrets tab — not unsaved draft values. Useful for
                  confirming a Bedrock or Gemini Enterprise model ID actually resolves before
                  pointing a role at it.
                </span>
              </div>
              {providers.map((p) => (
                <div key={p} className="space-y-1.5">
                  <div className="text-[11px] uppercase tracking-wide text-white/40">
                    {PROVIDER_LABELS[p] || p}
                  </div>
                  {!(models[p] || []).length && (
                    <div className="text-[11px] text-white/30">No models listed.</div>
                  )}
                  {(models[p] || []).map((m) => {
                    const key = `${p}:${m.id}`;
                    const status = testStatus[key] || { state: "idle" as TestOutcome };
                    return (
                      <div key={m.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-white/70 flex-1 truncate">{m.label}</span>
                          {status.state === "ok" && (
                            <Badge tone="success">
                              ok{status.latency_ms != null ? ` · ${status.latency_ms}ms` : ""}
                            </Badge>
                          )}
                          {status.state === "error" && <Badge tone="danger">failed</Badge>}
                          {status.state === "not_configured" && <Badge tone="warning">not configured</Badge>}
                          {status.state === "not_implemented" && <Badge tone="neutral">stub</Badge>}
                          <Button size="sm" variant="outline" loading={status.state === "testing"}
                            onClick={() => testModel(p, m.id)}>
                            Test
                          </Button>
                        </div>
                        {status.detail && status.state !== "ok" && (
                          <div className="text-white/40 mt-1 truncate" title={status.detail}>{status.detail}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
