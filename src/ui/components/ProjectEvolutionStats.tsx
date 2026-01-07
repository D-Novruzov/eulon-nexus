/**
 * ProjectEvolutionStats Component
 *
 * Displays statistics about how the project has evolved over time,
 * including code changes, file modifications, and contributor activity.
 */

import React from "react";
import type { CommitTimeline } from "../../core/graph/commit-history.types.ts";

interface ProjectEvolutionStatsProps {
  timeline: CommitTimeline | null;
}

const ProjectEvolutionStats: React.FC<ProjectEvolutionStatsProps> = ({
  timeline,
}) => {
  if (!timeline) {
    return null;
  }

  const { stats, commits } = timeline;

  // Calculate authors
  const authorMap = new Map<string, number>();
  commits.forEach((commit) => {
    const author = commit.author.name;
    authorMap.set(author, (authorMap.get(author) || 0) + 1);
  });
  const topAuthors = Array.from(authorMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Calculate commits per month
  const monthlyCommits = new Map<string, number>();
  commits.forEach((commit) => {
    const date = new Date(commit.timestamp);
    const monthKey = `${date.getFullYear()}-${String(
      date.getMonth() + 1
    ).padStart(2, "0")}`;
    monthlyCommits.set(monthKey, (monthlyCommits.get(monthKey) || 0) + 1);
  });
  const maxMonthlyCommits = Math.max(...Array.from(monthlyCommits.values()), 1);

  // Calculate date range
  const earliestDate = new Date(stats.dateRange.earliest);
  const latestDate = new Date(stats.dateRange.latest);
  const daysDiff = Math.floor(
    (latestDate.getTime() - earliestDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>📈 Project Evolution</h3>

      {/* Key Metrics */}
      <div style={styles.metricsGrid}>
        <div style={styles.metricCard}>
          <div style={styles.metricValue}>{commits.length}</div>
          <div style={styles.metricLabel}>Total Commits</div>
        </div>

        <div style={styles.metricCard}>
          <div style={styles.metricValue}>{daysDiff}</div>
          <div style={styles.metricLabel}>Days of History</div>
        </div>

        <div style={styles.metricCard}>
          <div style={styles.metricValue}>
            {commits.length > 0
              ? (commits.length / Math.max(daysDiff, 1)).toFixed(1)
              : 0}
          </div>
          <div style={styles.metricLabel}>Commits/Day</div>
        </div>

        <div style={styles.metricCard}>
          <div style={styles.metricValue}>{authorMap.size}</div>
          <div style={styles.metricLabel}>Contributors</div>
        </div>

        <div style={styles.metricCard}>
          <div style={styles.metricValue}>
            {stats.totalAdditions + stats.totalDeletions || "N/A"}
          </div>
          <div style={styles.metricLabel}>Total Changes</div>
        </div>

        <div style={styles.metricCard}>
          <div style={styles.metricValue}>{stats.filesChanged.size}</div>
          <div style={styles.metricLabel}>Files Modified</div>
        </div>
      </div>

      {/* Top Contributors */}
      {topAuthors.length > 0 && (
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>👥 Top Contributors</h4>
          <div style={styles.contributorsList}>
            {topAuthors.map(([author, count], index) => {
              const percentage = (count / commits.length) * 100;
              return (
                <div key={author} style={styles.contributorItem}>
                  <span style={styles.contributorRank}>#{index + 1}</span>
                  <span style={styles.contributorName}>{author}</span>
                  <div style={styles.progressBar}>
                    <div
                      style={{
                        ...styles.progressFill,
                        width: `${percentage}%`,
                      }}
                    />
                  </div>
                  <span style={styles.contributorCount}>
                    {count} ({percentage.toFixed(1)}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Monthly Activity */}
      {monthlyCommits.size > 0 && (
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>📅 Monthly Activity</h4>
          <div style={styles.activityContainer}>
            {Array.from(monthlyCommits.entries())
              .sort()
              .map(([month, count]) => {
                const height = (count / maxMonthlyCommits) * 100;
                return (
                  <div
                    key={month}
                    style={styles.activityBar}
                    title={`${month}: ${count} commits`}
                  >
                    <div
                      style={{
                        ...styles.activityBarFill,
                        height: `${height}%`,
                      }}
                    />
                    <span style={styles.activityLabel}>{month}</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Code Statistics */}
      {stats.totalAdditions > 0 || stats.totalDeletions > 0 ? (
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>📝 Code Changes</h4>
          <div style={styles.codeStatsContainer}>
            <div style={styles.codeStat}>
              <span style={styles.codeStatLabel}>Lines Added:</span>
              <span style={{ ...styles.codeStatValue, color: "#27ae60" }}>
                +{stats.totalAdditions}
              </span>
            </div>
            <div style={styles.codeStat}>
              <span style={styles.codeStatLabel}>Lines Deleted:</span>
              <span style={{ ...styles.codeStatValue, color: "#e74c3c" }}>
                -{stats.totalDeletions}
              </span>
            </div>
            <div style={styles.codeStat}>
              <span style={styles.codeStatLabel}>Avg Changes/Commit:</span>
              <span style={styles.codeStatValue}>
                ±{stats.averageChangesPerCommit}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {/* Date Range */}
      <div style={styles.section}>
        <h4 style={styles.sectionTitle}>📆 Time Period</h4>
        <div style={styles.dateRangeContainer}>
          <div style={styles.dateItem}>
            <span style={styles.dateLabel}>From:</span>
            <span style={styles.dateValue}>
              {earliestDate.toLocaleDateString("en-US", {
                weekday: "short",
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
          <div style={styles.dateItem}>
            <span style={styles.dateLabel}>To:</span>
            <span style={styles.dateValue}>
              {latestDate.toLocaleDateString("en-US", {
                weekday: "short",
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    padding: "20px",
    backgroundColor: "#f8f9fa",
    borderRadius: "8px",
    border: "1px solid #e0e0e0",
  },
  title: {
    margin: "0 0 20px 0",
    fontSize: "18px",
    fontWeight: "600" as const,
    color: "#333",
  },
  metricsGrid: {
    display: "grid" as const,
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: "12px",
    marginBottom: "25px",
  },
  metricCard: {
    backgroundColor: "white",
    padding: "15px",
    borderRadius: "6px",
    textAlign: "center" as const,
    border: "1px solid #e0e0e0",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  },
  metricValue: {
    fontSize: "28px",
    fontWeight: "bold" as const,
    color: "#3498db",
    marginBottom: "5px",
  },
  metricLabel: {
    fontSize: "12px",
    color: "#666",
    fontWeight: "500" as const,
  },
  section: {
    marginBottom: "20px",
  },
  sectionTitle: {
    margin: "0 0 12px 0",
    fontSize: "14px",
    fontWeight: "600" as const,
    color: "#333",
  },
  contributorsList: {
    display: "flex" as const,
    flexDirection: "column" as const,
    gap: "10px",
  },
  contributorItem: {
    display: "flex" as const,
    alignItems: "center" as const,
    gap: "10px",
    padding: "10px",
    backgroundColor: "white",
    borderRadius: "4px",
    border: "1px solid #e0e0e0",
  },
  contributorRank: {
    fontWeight: "bold" as const,
    color: "#3498db",
    minWidth: "30px",
  },
  contributorName: {
    minWidth: "120px",
    fontWeight: "500" as const,
    color: "#333",
  },
  progressBar: {
    flex: 1,
    height: "6px",
    backgroundColor: "#ecf0f1",
    borderRadius: "3px",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#3498db",
    transition: "width 0.3s ease",
  },
  contributorCount: {
    fontSize: "12px",
    color: "#666",
    minWidth: "60px",
    textAlign: "right" as const,
  },
  activityContainer: {
    display: "flex" as const,
    gap: "4px",
    height: "80px",
    alignItems: "flex-end" as const,
    backgroundColor: "white",
    padding: "10px",
    borderRadius: "4px",
    border: "1px solid #e0e0e0",
    overflowX: "auto" as const,
  },
  activityBar: {
    display: "flex" as const,
    flexDirection: "column" as const,
    alignItems: "center" as const,
    justifyContent: "flex-end" as const,
    minWidth: "40px",
    gap: "4px",
    cursor: "pointer" as const,
  },
  activityBarFill: {
    width: "100%",
    backgroundColor: "#3498db",
    borderRadius: "2px",
    minHeight: "3px",
    transition: "background-color 0.2s ease",
  },
  activityLabel: {
    fontSize: "10px",
    color: "#999",
    textAlign: "center" as const,
    whiteSpace: "nowrap" as const,
    transform: "rotate(-45deg)",
    transformOrigin: "center",
    marginTop: "5px",
  },
  codeStatsContainer: {
    display: "grid" as const,
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: "10px",
  },
  codeStat: {
    backgroundColor: "white",
    padding: "12px",
    borderRadius: "4px",
    border: "1px solid #e0e0e0",
    display: "flex" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
  },
  codeStatLabel: {
    fontSize: "13px",
    color: "#666",
    fontWeight: "500" as const,
  },
  codeStatValue: {
    fontSize: "16px",
    fontWeight: "bold" as const,
  },
  dateRangeContainer: {
    display: "grid" as const,
    gridTemplateColumns: "1fr 1fr",
    gap: "10px",
  },
  dateItem: {
    backgroundColor: "white",
    padding: "12px",
    borderRadius: "4px",
    border: "1px solid #e0e0e0",
    display: "flex" as const,
    flexDirection: "column" as const,
    gap: "4px",
  },
  dateLabel: {
    fontSize: "12px",
    color: "#666",
    fontWeight: "500" as const,
  },
  dateValue: {
    fontSize: "14px",
    color: "#333",
    fontWeight: "500" as const,
  },
} as const;

export default ProjectEvolutionStats;
