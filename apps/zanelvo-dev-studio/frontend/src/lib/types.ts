// Shared shapes for the most-reused API payloads. Not exhaustive — event payloads and other
// genuinely heterogeneous/rarely-reused data stay loosely typed at the call site rather than
// forcing a premature union type here.

export interface Project {
  id: string;
  name: string;
  github_owner?: string;
  github_repo?: string;
  default_branch: string;
  last_indexed_commit_sha?: string | null;
}

export interface Branch {
  name: string;
  [key: string]: unknown;
}

export interface Task {
  id: string;
  project_id: string;
  title: string;
  status: string;
  mode: string;
  branch: string;
  blocked_reason?: string | null;
  created_at?: string;
}

export interface PlanItem {
  id: string;
  title: string;
  description: string;
  status: string;
  assigned_agent: string;
}

export interface DiffFile {
  path: string;
  change_type: string;
  additions: number;
  deletions: number;
}

export interface DiffSummary {
  changed_file_count: number;
  total_additions: number;
  total_deletions: number;
  files: DiffFile[];
}

export interface TestRun {
  id: string;
  status: string;
  test_type: string;
  command: string;
  duration_ms: number;
  stderr_tail?: string;
}

export interface Checkpoint {
  id: string;
  label: string;
  commit_sha?: string;
  branch: string;
}

export interface MemoryItem {
  id: string;
  category: string;
  title: string;
  content: string;
  stale?: boolean;
}


export interface Upload {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  is_image: boolean;
  attach_to_vision: boolean;
}
