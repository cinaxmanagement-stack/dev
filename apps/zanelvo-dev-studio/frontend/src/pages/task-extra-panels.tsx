import { useEffect, useRef, useState } from "react";
import { RotateCcw, Save, Play, Square, Link2, Camera, History, MonitorPlay,
  ImagePlus, Eye, EyeOff, FileText } from "lucide-react";
import devstudio from "@/lib/devstudio";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { Checkpoint, Upload } from "@/lib/types";

// --- Checkpoints ---------------------------------------------------------------------------

export function CheckpointsPanel({ taskId }: { taskId: string }) {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<{ id: string; label: string } | null>(null);

  async function load() {
    const { data } = await devstudio.checkpoints(taskId);
    setCheckpoints(data.checkpoints);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  async function create() {
    if (!label.trim()) return;
    setBusy(true);
    try {
      await devstudio.createCheckpoint(taskId, label.trim());
      toast.success("Checkpoint created");
      setLabel("");
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Could not create checkpoint");
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    if (!restoreTarget) return;
    try {
      await devstudio.restoreCheckpoint(taskId, restoreTarget.id, true);
      toast.success("Restored");
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Restore failed");
    }
  }

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="flex gap-1.5 mb-3">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Checkpoint label…"
          onKeyDown={(e) => e.key === "Enter" && create()} />
        <Button size="sm" disabled={busy || !label.trim()} onClick={create}>
          <Save className="w-3.5 h-3.5" />
        </Button>
      </div>
      {checkpoints.map((c) => (
        <div key={c.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 mb-2 text-xs hover:border-white/15 transition-colors">
          <div className="flex items-center justify-between gap-2">
            <span className="text-white/85 font-medium truncate">{c.label}</span>
            <Button size="sm" variant="outline" onClick={() => setRestoreTarget({ id: c.id, label: c.label })}>
              <RotateCcw className="w-3 h-3" /> Restore
            </Button>
          </div>
          <div className="text-white/40 mt-1 font-mono">{c.commit_sha?.slice(0, 10)} · {c.branch}</div>
        </div>
      ))}
      {!checkpoints.length && <EmptyState compact icon={History} title="No checkpoints yet" description="Save one before a risky change." />}

      <ConfirmDialog
        open={!!restoreTarget}
        onOpenChange={(v) => !v && setRestoreTarget(null)}
        title={`Restore "${restoreTarget?.label ?? ""}"?`}
        description="This discards any uncommitted changes made after this checkpoint. It cannot be undone."
        confirmLabel="Restore"
        danger
        onConfirm={restore}
      />
    </div>
  );
}

// --- Preview -----------------------------------------------------------------------------

export function PreviewPanel({ taskId }: { taskId: string }) {
  const [state, setState] = useState<any>(null);
  const [externalUrl, setExternalUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function startLive() {
    setBusy(true);
    try {
      const { data } = await devstudio.previewLiveLocal(taskId);
      setState(data);
      if (data.status !== "running") toast.error(data.detail || "Preview unavailable");
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Could not start preview");
    } finally {
      setBusy(false);
    }
  }

  async function stopLive() {
    await devstudio.previewStop(taskId);
    setState(null);
  }

  async function attachExternal() {
    if (!externalUrl.trim()) return;
    const { data } = await devstudio.previewExternal(taskId, externalUrl.trim());
    setState(data);
  }

  async function loadScreenshotMode() {
    const { data } = await devstudio.previewScreenshot(taskId);
    setState(data);
  }

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3">
      <div className="flex gap-1.5">
        <Button size="sm" variant="outline" loading={busy} onClick={startLive}>
          <Play className="w-3.5 h-3.5" /> Live local
        </Button>
        <Button size="sm" variant="outline" onClick={stopLive}>
          <Square className="w-3.5 h-3.5" /> Stop
        </Button>
        <Button size="sm" variant="outline" onClick={loadScreenshotMode}>
          <Camera className="w-3.5 h-3.5" /> Screenshot
        </Button>
      </div>
      <div className="flex gap-1.5">
        <Input value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)}
          placeholder="https://your-preview-env…" onKeyDown={(e) => e.key === "Enter" && attachExternal()} />
        <Button size="sm" variant="outline" onClick={attachExternal}>
          <Link2 className="w-3.5 h-3.5" />
        </Button>
      </div>
      {state && (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs space-y-1.5 animate-fade-up">
          <div className="flex items-center gap-2">
            <Badge className="border-white/15 text-white/60">{state.mode}</Badge>
            <Badge tone={state.status === "running" || state.status === "attached" ? "success" : "warning"} dot>
              {state.status}
            </Badge>
          </div>
          {state.url && (
            <a href={state.url} target="_blank" rel="noreferrer" className="text-indigo-300 hover:text-indigo-200 underline block break-all transition-colors">
              {state.url}
            </a>
          )}
          {state.detail && <div className="text-white/50">{state.detail}</div>}
        </div>
      )}
      {!state && <EmptyState compact icon={MonitorPlay} title="No preview started yet" />}
    </div>
  );
}

// --- Uploads (vision attachments) --------------------------------------------------------

export function UploadsPanel({ taskId }: { taskId: string }) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    const { data } = await devstudio.taskUploads(taskId);
    setUploads(data.uploads);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      await devstudio.uploadFile(taskId, file);
      toast.success(`Uploaded ${file.name}`);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function toggleVision(u: Upload) {
    try {
      const { data } = await devstudio.setUploadVision(u.id, !u.attach_to_vision);
      setUploads((prev) => prev.map((x) => (x.id === u.id ? data : x)));
      toast.success(data.attach_to_vision ? "Will be sent to the Design vision model" : "Removed from vision");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Could not update");
    }
  }

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3" data-testid="uploads-panel">
      <div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={onPick}
          data-testid="upload-file-input"
        />
        <Button size="sm" variant="secondary" loading={busy} onClick={() => fileRef.current?.click()}
          data-testid="upload-add-button">
          <ImagePlus className="w-3.5 h-3.5" /> Add screenshot / image
        </Button>
        <p className="text-[11px] text-white/40 mt-1.5 leading-relaxed">
          Toggle an image to <strong className="text-white/60">send it to the Design agent's vision
          model</strong> on the next run. Images are only attached when you ask — never injected
          into every request.
        </p>
      </div>

      {uploads.map((u) => (
        <div key={u.id} data-testid={`upload-item-${u.id}`}
          className={`rounded-lg border p-2.5 text-xs transition-colors ${
            u.attach_to_vision ? "border-indigo-400/40 bg-indigo-500/[0.07]" : "border-white/10 bg-white/[0.03]"
          }`}>
          <div className="flex items-center gap-2.5">
            {u.is_image ? (
              <img src={devstudio.uploadDownloadUrl(u.id)} alt={u.filename}
                className="w-12 h-12 rounded object-cover border border-white/10 flex-shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded bg-white/[0.05] grid place-items-center flex-shrink-0">
                <FileText className="w-5 h-5 text-white/40" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-white/85 font-medium truncate">{u.filename}</div>
              <div className="text-white/40 mt-0.5">{Math.round(u.size_bytes / 1024)} KB</div>
              {u.attach_to_vision && (
                <Badge tone="success" className="mt-1" dot>vision</Badge>
              )}
            </div>
            {u.is_image && (
              <Button size="sm" variant={u.attach_to_vision ? "secondary" : "outline"}
                onClick={() => toggleVision(u)} data-testid={`upload-vision-toggle-${u.id}`}>
                {u.attach_to_vision ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                {u.attach_to_vision ? "Detach" : "To vision"}
              </Button>
            )}
          </div>
        </div>
      ))}
      {!uploads.length && (
        <EmptyState compact icon={ImagePlus} title="No uploads yet"
          description="Add a screenshot or mockup to guide the Design agent." />
      )}
    </div>
  );
}
