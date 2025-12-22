// @ts-nocheck
import React, { useEffect, useState } from "react";

interface NormalizedRepo {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  description: string | null;
  defaultBranch: string;
  language: string | null;
  visibility: "public" | "private" | "internal";
}

interface GitHubRepoPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (repos: NormalizedRepo[]) => Promise<void>;
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

const GitHubRepoPicker: React.FC<GitHubRepoPickerProps> = ({
  isOpen,
  onClose,
  onImport,
}) => {
  const [repos, setRepos] = useState<NormalizedRepo[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    void loadRepos();
  }, [isOpen]);

  const loadRepos = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get session token from localStorage (workaround for cross-origin cookies)
      const sessionToken = localStorage.getItem("github_session_token");

      const headers: HeadersInit = {};

      // Add session token to header if available
      if (sessionToken) {
        headers["X-Session-Token"] = sessionToken;
      }

      const res = await fetch(`${API_BASE_URL}/integrations/github/repos`, {
        credentials: "include",
        headers,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load repositories");
      }
      const data = (await res.json()) as { repos: NormalizedRepo[] };
      setRepos(data.repos);
      setSelectedIds(new Set());
    } catch (e) {
      console.error("Failed to load GitHub repositories", e);
      setError(
        e instanceof Error
          ? e.message
          : "Unable to load repositories. Check permissions and rate limits."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelection = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleImport = async () => {
    const selected = repos.filter((r) => selectedIds.has(r.id));
    if (selected.length === 0) return;
    try {
      setIsImporting(true);
      setError(null);
      await onImport(selected);
      onClose();
    } catch (e) {
      console.error("GitHub import failed", e);
      setError(
        e instanceof Error
          ? e.message
          : "Failed to import repositories. Check permissions and rate limits."
      );
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen) return null;

  const hasSelection = selectedIds.size > 0;

  return (
    <div className="gh-modal-backdrop" onClick={onClose}>
      <div
        className="gh-modal"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="gh-modal-header">
          <div>
            <h3 className="gh-modal-title">Select Repositories</h3>
            <p className="gh-modal-subtitle">
              Choose one or more repositories to import into your knowledge
              graph.
            </p>
          </div>
          <button className="gh-close-button" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="gh-modal-body">
          {isLoading ? (
            <div className="gh-loading">Loading repositories…</div>
          ) : error ? (
            <div className="gh-error">{error}</div>
          ) : repos.length === 0 ? (
            <div className="gh-empty">
              No repositories found for this account.
            </div>
          ) : (
            <div className="gh-repo-list">
              {repos.map((repo) => {
                const selected = selectedIds.has(repo.id);
                return (
                  <button
                    key={repo.id}
                    className={`gh-repo-item ${
                      selected ? "gh-repo-item-selected" : ""
                    }`}
                    type="button"
                    onClick={() => toggleSelection(repo.id)}
                  >
                    <div className="gh-repo-main">
                      <div className="gh-repo-name-row">
                        <span className="gh-repo-name">{repo.fullName}</span>
                        <span
                          className={`gh-badge ${
                            repo.visibility === "private"
                              ? "gh-badge-danger"
                              : "gh-badge-muted"
                          }`}
                        >
                          {repo.visibility === "private" ? "Private" : "Public"}
                        </span>
                      </div>
                      {repo.description && (
                        <div className="gh-repo-description">
                          {repo.description}
                        </div>
                      )}
                    </div>
                    <div className="gh-repo-meta">
                      {repo.language && (
                        <span className="gh-language">
                          <span className="gh-language-dot" /> {repo.language}
                        </span>
                      )}
                      <span className="gh-branch">
                        Default: {repo.defaultBranch}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="gh-modal-footer">
          <div className="gh-footer-left">
            {hasSelection && (
              <span className="gh-selection-count">
                {selectedIds.size} repo{selectedIds.size > 1 ? "s" : ""}{" "}
                selected
              </span>
            )}
          </div>
          <div className="gh-footer-right">
            <button
              className="gh-secondary-button"
              onClick={onClose}
              disabled={isImporting}
            >
              Cancel
            </button>
            <button
              className="gh-primary-button"
              onClick={handleImport}
              disabled={!hasSelection || isImporting}
            >
              {isImporting ? "Importing…" : "Import to Graph"}
            </button>
          </div>
        </div>

        <style>{`
          .gh-modal-backdrop {
            position: fixed;
            inset: 0;
            background: radial-gradient(circle at top, rgba(15,23,42,0.85), rgba(15,23,42,0.9));
            display: flex;
            align-items: center;
            justify-content: center;
            /* Higher than the welcome overlay (1000) so the picker is visible */
            z-index: 2000;
          }

          .gh-modal {
            width: 720px;
            max-width: 100%;
            max-height: 80vh;
            background: radial-gradient(circle at top left, rgba(79, 70, 229, 0.4), transparent),
                        radial-gradient(circle at bottom right, rgba(34, 211, 238, 0.25), transparent),
                        #020617;
            border-radius: 20px;
            border: 1px solid rgba(148, 163, 184, 0.5);
            box-shadow: 0 30px 80px rgba(15, 23, 42, 0.95);
            padding: 1.25rem 1.5rem 1.25rem;
            display: flex;
            flex-direction: column;
            color: #e5e7eb;
          }

          .gh-modal-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 1rem;
            margin-bottom: 0.75rem;
          }

          .gh-modal-title {
            margin: 0;
            font-size: 1.1rem;
            font-weight: 600;
            color: #f9fafb;
          }

          .gh-modal-subtitle {
            margin: 0.25rem 0 0;
            font-size: 0.85rem;
            color: #9ca3af;
          }

          .gh-close-button {
            background: transparent;
            border: none;
            color: #9ca3af;
            cursor: pointer;
            font-size: 1rem;
          }

          .gh-modal-body {
            flex: 1;
            min-height: 260px;
            margin-top: 0.25rem;
          }

          .gh-loading,
          .gh-error,
          .gh-empty {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.9rem;
            color: #d1d5db;
          }

          .gh-error {
            color: #fecaca;
          }

          .gh-repo-list {
            max-height: 360px;
            overflow-y: auto;
            padding-right: 0.25rem;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
          }

          .gh-repo-item {
            width: 100%;
            text-align: left;
            border-radius: 10px;
            border: 1px solid rgba(55, 65, 81, 0.9);
            background: radial-gradient(circle at top left, rgba(99, 102, 241, 0.22), transparent),
                        rgba(15, 23, 42, 0.9);
            padding: 0.75rem 0.9rem;
            display: flex;
            justify-content: space-between;
            gap: 0.75rem;
            cursor: pointer;
            transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
          }

          .gh-repo-item:hover {
            border-color: rgba(129, 140, 248, 0.95);
            box-shadow: 0 0 0 1px rgba(129, 140, 248, 0.6);
          }

          .gh-repo-item-selected {
            border-color: rgba(34, 197, 94, 0.9);
            box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.7);
            background: radial-gradient(circle at top left, rgba(34, 197, 94, 0.35), transparent),
                        rgba(15, 23, 42, 0.92);
          }

          .gh-repo-main {
            flex: 1;
            min-width: 0;
          }

          .gh-repo-name-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.6rem;
          }

          .gh-repo-name {
            font-size: 0.9rem;
            font-weight: 600;
            color: #f9fafb;
            white-space: nowrap;
            text-overflow: ellipsis;
            overflow: hidden;
          }

          .gh-badge {
            border-radius: 999px;
            padding: 0.15rem 0.6rem;
            font-size: 0.65rem;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            font-weight: 600;
          }

          .gh-badge-muted {
            background: rgba(148, 163, 184, 0.16);
            border: 1px solid rgba(148, 163, 184, 0.6);
            color: #cbd5f5;
          }

          .gh-badge-danger {
            background: rgba(220, 38, 38, 0.15);
            border: 1px solid rgba(248, 113, 113, 0.85);
            color: #fecaca;
          }

          .gh-repo-description {
            margin-top: 0.2rem;
            font-size: 0.8rem;
            color: #9ca3af;
            line-height: 1.4;
            max-height: 2.6em;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .gh-repo-meta {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 0.25rem;
            font-size: 0.75rem;
            color: #9ca3af;
          }

          .gh-language {
            display: inline-flex;
            align-items: center;
            gap: 0.3rem;
          }

          .gh-language-dot {
            width: 8px;
            height: 8px;
            border-radius: 999px;
            background: radial-gradient(circle, #22d3ee, #6366f1);
            box-shadow: 0 0 10px rgba(34, 211, 238, 0.9);
          }

          .gh-branch {
            opacity: 0.9;
          }

          .gh-modal-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.75rem;
            margin-top: 0.75rem;
          }

          .gh-selection-count {
            font-size: 0.8rem;
            color: #e5e7eb;
          }

          .gh-footer-right {
            display: flex;
            gap: 0.5rem;
          }

          .gh-secondary-button {
            padding: 0.4rem 0.9rem;
            border-radius: 999px;
            border: 1px solid rgba(148, 163, 184, 0.7);
            background: transparent;
            color: #e5e7eb;
            font-size: 0.85rem;
            cursor: pointer;
          }

          .gh-primary-button {
            padding: 0.45rem 1.1rem;
            border-radius: 999px;
            border: none;
            background: linear-gradient(135deg, #6366f1, #22d3ee);
            box-shadow: 0 15px 40px rgba(56, 189, 248, 0.55);
            color: #f9fafb;
            font-size: 0.85rem;
            font-weight: 600;
            cursor: pointer;
          }

          .gh-primary-button:disabled {
            opacity: 0.6;
            cursor: default;
            box-shadow: none;
          }
        `}</style>
      </div>
    </div>
  );
};

export default GitHubRepoPicker;
