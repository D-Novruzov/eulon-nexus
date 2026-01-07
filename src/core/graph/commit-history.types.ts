/**
 * Commit History Types
 *
 * Types for tracking and displaying how the project codebase
 * evolved across different commits.
 */

export interface CommitInfo {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
    date: string;
  };
  committer: {
    name: string;
    email: string;
    date: string;
  };
  url: string;
  htmlUrl: string;
  timestamp: number; // Unix timestamp
}

export interface CommitDiff {
  sha: string;
  timestamp: number;
  filesChanged: number;
  additions: number;
  deletions: number;
  changedFiles: ChangedFile[];
}

export interface ChangedFile {
  filename: string;
  status:
    | "added"
    | "removed"
    | "modified"
    | "renamed"
    | "copied"
    | "unchanged"
    | "unknown";
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

export interface CommitHistoryStats {
  totalCommits: number;
  dateRange: {
    earliest: number;
    latest: number;
  };
  filesChanged: Set<string>;
  totalAdditions: number;
  totalDeletions: number;
  averageChangesPerCommit: number;
}

export interface ProjectSnapshot {
  commit: CommitInfo;
  codebaseStats: {
    fileCount: number;
    totalLines: number;
    languages: Record<string, number>;
  };
  graphSnapshot: {
    nodeCount: number;
    relationshipCount: number;
    nodesByType: Record<string, number>;
  };
}

export interface CommitTimeline {
  commits: CommitInfo[];
  stats: CommitHistoryStats;
  snapshots: ProjectSnapshot[];
}
