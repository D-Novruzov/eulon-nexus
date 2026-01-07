/**
 * CommitHistoryViewer Component
 *
 * Displays an interactive timeline of commits and how the project evolved.
 * Shows commit messages, authors, dates, and statistics.
 */

import React, { useState } from "react";
import type {
  CommitInfo,
  CommitTimeline,
} from "../../core/graph/commit-history.types.ts";

interface CommitHistoryViewerProps {
  timeline: CommitTimeline | null;
  onCommitSelect?: (commit: CommitInfo) => void;
  onAnalyzeCommit?: (commit: CommitInfo) => void;
  onLoadGraph?: (commit: CommitInfo) => void;
  analyzedCommits?: Set<string>; // Set of commit SHAs that have graphs stored
  loadingCommitSha?: string | null; // Currently loading commit
  isLoading?: boolean;
}

const CommitHistoryViewer: React.FC<CommitHistoryViewerProps> = ({
  timeline,
  onCommitSelect,
  onAnalyzeCommit,
  onLoadGraph,
  analyzedCommits = new Set(),
  loadingCommitSha = null,
  isLoading = false,
}) => {
  const [selectedCommitSha, setSelectedCommitSha] = useState<string | null>(
    null
  );
  const [filterAuthor, setFilterAuthor] = useState<string>("");

  if (isLoading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingMessage}>⏳ Loading commit history...</div>
      </div>
    );
  }

  if (!timeline || timeline.commits.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyMessage}>📭 No commit history available</div>
      </div>
    );
  }

  const filteredCommits = filterAuthor
    ? timeline.commits.filter((c) => c.author.name === filterAuthor)
    : timeline.commits;

  const authors = Array.from(
    new Set(timeline.commits.map((c) => c.author.name))
  ).sort();

  const handleCommitClick = (commit: CommitInfo) => {
    setSelectedCommitSha(commit.sha);
    onCommitSelect?.(commit);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatTimeSince = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return "just now";
  };

  const getCommitMessagePreview = (message: string, maxLength = 60) => {
    const firstLine = message.split("\n")[0];
    return firstLine.length > maxLength
      ? `${firstLine.substring(0, maxLength)}...`
      : firstLine;
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>📜 Commit History</h2>
        <div style={styles.stats}>
          <span style={styles.statItem}>
            📊 {timeline.stats.totalCommits} commits
          </span>
          <span style={styles.statItem}>
            👤 {authors.length} author{authors.length !== 1 ? "s" : ""}
          </span>
          <span style={styles.statItem}>
            📅{" "}
            {new Date(timeline.stats.dateRange.earliest).toLocaleDateString()} -{" "}
            {new Date(timeline.stats.dateRange.latest).toLocaleDateString()}
          </span>
        </div>
      </div>

      {authors.length > 1 && (
        <div style={styles.filterSection}>
          <label style={styles.filterLabel}>Filter by author:</label>
          <select
            value={filterAuthor}
            onChange={(e) => setFilterAuthor(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="">All authors ({timeline.commits.length})</option>
            {authors.map((author) => (
              <option key={author} value={author}>
                {author} (
                {
                  timeline.commits.filter((c) => c.author.name === author)
                    .length
                }
                )
              </option>
            ))}
          </select>
        </div>
      )}

      <div style={styles.timelineContainer}>
        {filteredCommits.map((commit, index) => {
          const isSelected = selectedCommitSha === commit.sha;
          const isFirst = index === 0;
          const isLast = index === filteredCommits.length - 1;

          return (
            <div key={commit.sha} style={styles.commitItem}>
              <div style={styles.timelineMarker}>
                <div
                  style={{
                    ...styles.dot,
                    ...(isSelected && styles.dotSelected),
                  }}
                />
                {!isLast && <div style={styles.line} />}
              </div>

              <div
                style={{
                  ...styles.commitContent,
                  ...(isSelected && styles.commitContentSelected),
                }}
                onClick={() => handleCommitClick(commit)}
              >
                <div style={styles.commitHeader}>
                  <span style={styles.commitSha}>
                    {commit.sha.substring(0, 7)}
                  </span>
                  <span style={styles.commitTime}>
                    {formatDate(commit.timestamp)}
                  </span>
                  <span style={styles.commitAgo}>
                    {formatTimeSince(commit.timestamp)}
                  </span>
                </div>

                <div style={styles.commitMessage}>
                  {getCommitMessagePreview(commit.message)}
                </div>

                <div style={styles.commitFooter}>
                  <span style={styles.commitAuthor}>
                    👤 {commit.author.name}
                  </span>

                  {/* Graph action buttons */}
                  <div style={styles.commitActions}>
                    {analyzedCommits.has(commit.sha) ? (
                      <button
                        style={styles.loadGraphButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          onLoadGraph?.(commit);
                        }}
                        disabled={loadingCommitSha === commit.sha}
                      >
                        {loadingCommitSha === commit.sha
                          ? "⏳ Loading..."
                          : "📊 Load Graph"}
                      </button>
                    ) : (
                      <button
                        style={styles.analyzeButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          onAnalyzeCommit?.(commit);
                        }}
                        disabled={loadingCommitSha === commit.sha}
                      >
                        {loadingCommitSha === commit.sha
                          ? "⏳ Analyzing..."
                          : "🔍 Analyze"}
                      </button>
                    )}
                  </div>

                  <a
                    href={commit.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.commitLink}
                    onClick={(e) => e.stopPropagation()}
                  >
                    View on GitHub ↗
                  </a>
                </div>

                {isSelected && (
                  <div style={styles.commitDetails}>
                    <h4 style={styles.detailsTitle}>Full Message:</h4>
                    <pre style={styles.fullMessage}>{commit.message}</pre>
                    <div style={styles.detailsGrid}>
                      <div style={styles.detailItem}>
                        <span style={styles.detailLabel}>Committer:</span>
                        <span>{commit.committer.name}</span>
                      </div>
                      <div style={styles.detailItem}>
                        <span style={styles.detailLabel}>Email:</span>
                        <span style={styles.detailValue}>
                          {commit.author.email}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const styles = {
  container: {
    padding: "20px",
    backgroundColor: "#f5f5f5",
    borderRadius: "8px",
    maxHeight: "800px",
    overflowY: "auto" as const,
  },
  header: {
    marginBottom: "20px",
    paddingBottom: "15px",
    borderBottom: "2px solid #ddd",
  },
  title: {
    margin: "0 0 10px 0",
    fontSize: "20px",
    fontWeight: "600",
    color: "#333",
  },
  stats: {
    display: "flex" as const,
    gap: "20px",
    flexWrap: "wrap" as const,
    fontSize: "14px",
    color: "#666",
  },
  statItem: {
    display: "flex" as const,
    alignItems: "center",
    gap: "5px",
  },
  filterSection: {
    marginBottom: "20px",
    display: "flex" as const,
    gap: "10px",
    alignItems: "center",
  },
  filterLabel: {
    fontWeight: "500" as const,
    color: "#333",
    fontSize: "14px",
  },
  filterSelect: {
    padding: "6px 10px",
    borderRadius: "4px",
    border: "1px solid #ccc",
    fontSize: "14px",
    cursor: "pointer" as const,
    backgroundColor: "white",
  },
  timelineContainer: {
    position: "relative" as const,
  },
  commitItem: {
    display: "flex" as const,
    gap: "15px",
    marginBottom: "15px",
    position: "relative" as const,
  },
  timelineMarker: {
    display: "flex" as const,
    flexDirection: "column" as const,
    alignItems: "center",
    minWidth: "30px",
  },
  dot: {
    width: "12px",
    height: "12px",
    borderRadius: "50%",
    backgroundColor: "#3498db",
    cursor: "pointer" as const,
    transition: "all 0.2s ease",
  },
  dotSelected: {
    width: "16px",
    height: "16px",
    backgroundColor: "#e74c3c",
    boxShadow: "0 0 0 3px rgba(231, 76, 60, 0.2)",
  },
  line: {
    flex: 1,
    width: "2px",
    backgroundColor: "#ddd",
    marginTop: "8px",
  },
  commitContent: {
    flex: 1,
    backgroundColor: "white",
    padding: "12px 15px",
    borderRadius: "6px",
    borderLeft: "3px solid #3498db",
    cursor: "pointer" as const,
    transition: "all 0.2s ease",
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
  },
  commitContentSelected: {
    borderLeftColor: "#e74c3c",
    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
    backgroundColor: "#fff9f7",
  },
  commitHeader: {
    display: "flex" as const,
    gap: "12px",
    marginBottom: "8px",
    alignItems: "center",
    flexWrap: "wrap" as const,
  },
  commitSha: {
    fontFamily: "monospace",
    backgroundColor: "#f0f0f0",
    padding: "2px 6px",
    borderRadius: "3px",
    fontSize: "12px",
    fontWeight: "bold" as const,
    color: "#333",
  },
  commitTime: {
    fontSize: "13px",
    color: "#666",
  },
  commitAgo: {
    fontSize: "12px",
    color: "#999",
    fontStyle: "italic" as const,
  },
  commitMessage: {
    fontSize: "14px",
    color: "#333",
    marginBottom: "8px",
    fontWeight: "500" as const,
  },
  commitFooter: {
    display: "flex" as const,
    justifyContent: "space-between" as const,
    gap: "10px",
    fontSize: "12px",
    color: "#666",
  },
  commitAuthor: {
    display: "flex" as const,
    alignItems: "center",
    gap: "5px",
  },
  commitLink: {
    color: "#3498db",
    textDecoration: "none",
    fontSize: "12px",
    cursor: "pointer" as const,
  },
  commitDetails: {
    marginTop: "12px",
    paddingTop: "12px",
    borderTop: "1px solid #eee",
    backgroundColor: "#f9f9f9",
    padding: "12px",
    borderRadius: "4px",
  },
  detailsTitle: {
    margin: "0 0 8px 0",
    fontSize: "13px",
    fontWeight: "600" as const,
    color: "#333",
  },
  fullMessage: {
    margin: "0 0 12px 0",
    padding: "8px",
    backgroundColor: "white",
    borderRadius: "3px",
    fontSize: "12px",
    fontFamily: "monospace",
    color: "#555",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    maxHeight: "150px",
    overflowY: "auto" as const,
    border: "1px solid #eee",
  },
  detailsGrid: {
    display: "grid" as const,
    gridTemplateColumns: "1fr 1fr",
    gap: "10px",
    fontSize: "12px",
  },
  detailItem: {
    display: "flex" as const,
    flexDirection: "column" as const,
    gap: "4px",
  },
  detailLabel: {
    fontWeight: "600" as const,
    color: "#666",
  },
  detailValue: {
    color: "#999",
    fontSize: "11px",
  },
  loadingMessage: {
    textAlign: "center" as const,
    padding: "40px",
    color: "#666",
    fontSize: "16px",
  },
  emptyMessage: {
    textAlign: "center" as const,
    padding: "40px",
    color: "#999",
    fontSize: "14px",
  },
  commitActions: {
    display: "flex" as const,
    gap: "8px",
  },
  analyzeButton: {
    padding: "4px 10px",
    fontSize: "11px",
    fontWeight: "500" as const,
    backgroundColor: "#3498db",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer" as const,
    transition: "background-color 0.2s",
  },
  loadGraphButton: {
    padding: "4px 10px",
    fontSize: "11px",
    fontWeight: "500" as const,
    backgroundColor: "#27ae60",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer" as const,
    transition: "background-color 0.2s",
  },
} as const;

export default CommitHistoryViewer;
