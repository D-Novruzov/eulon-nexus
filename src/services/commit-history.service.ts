/**
 * Commit History Service
 *
 * Fetches and analyzes commit history from GitHub repositories,
 * providing timeline data and statistics about how the project evolved.
 */

import { GitHubService } from "./github.ts";
import type {
  CommitInfo,
  CommitDiff,
  ChangedFile,
  CommitTimeline,
  CommitHistoryStats,
} from "../core/graph/commit-history.types.ts";

export interface CommitHistoryOptions {
  maxCommits?: number;
  includeStats?: boolean;
  includeDiffs?: boolean;
}

export class CommitHistoryService {
  private githubService: GitHubService;
  private commitCache: Map<string, CommitInfo[]> = new Map();

  constructor(githubToken?: string) {
    this.githubService = new GitHubService(githubToken);
  }

  /**
   * Fetch commit history for a repository
   */
  async fetchCommitHistory(
    owner: string,
    repo: string,
    options: CommitHistoryOptions = {}
  ): Promise<CommitInfo[]> {
    const { maxCommits = 100 } = options;
    const cacheKey = `${owner}/${repo}`;

    // Return cached result if available
    if (this.commitCache.has(cacheKey)) {
      return this.commitCache.get(cacheKey)!;
    }

    try {
      console.log(`📜 Fetching commit history for ${owner}/${repo}...`);

      const commits: CommitInfo[] = [];
      let page = 1;
      const perPage = 100;

      while (commits.length < maxCommits) {
        const response = await (this.githubService as any).client.get(
          `/repos/${owner}/${repo}/commits`,
          {
            params: {
              page,
              per_page: Math.min(perPage, maxCommits - commits.length),
            },
          }
        );

        if (!response.data || response.data.length === 0) {
          break;
        }

        response.data.forEach((commit: any) => {
          if (commits.length < maxCommits) {
            commits.push({
              sha: commit.sha,
              message: commit.commit.message,
              author: {
                name: commit.commit.author.name,
                email: commit.commit.author.email,
                date: commit.commit.author.date,
              },
              committer: {
                name: commit.commit.committer.name,
                email: commit.commit.committer.email,
                date: commit.commit.committer.date,
              },
              url: commit.url,
              htmlUrl: commit.html_url,
              timestamp: new Date(commit.commit.author.date).getTime(),
            });
          }
        });

        if (response.data.length < perPage) {
          break;
        }

        page++;
      }

      // Sort by timestamp (oldest first)
      commits.sort((a, b) => a.timestamp - b.timestamp);

      // Cache the result
      this.commitCache.set(cacheKey, commits);

      console.log(`✅ Fetched ${commits.length} commits from ${owner}/${repo}`);
      return commits;
    } catch (error: any) {
      console.error(`❌ Failed to fetch commit history: ${error}`);
      
      // Extract user-friendly error message from GitHub API response
      let errorMessage = "Failed to fetch commit history";
      
      if (error?.response) {
        const status = error.response.status;
        const data = error.response.data;
        
        if (status === 404) {
          errorMessage = `Repository ${owner}/${repo} not found. Please check that the repository exists and you have access to it.`;
        } else if (status === 403) {
          errorMessage = "Access denied. This repository may be private or you may have exceeded GitHub API rate limits.";
        } else if (status === 401) {
          errorMessage = "Authentication failed. Please reconnect your GitHub account.";
        } else if (data?.message) {
          errorMessage = data.message;
        } else {
          errorMessage = `GitHub API error (${status}): ${data?.message || "Unknown error"}`;
        }
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Fetch detailed diff information for a specific commit
   */
  async fetchCommitDiff(
    owner: string,
    repo: string,
    sha: string
  ): Promise<CommitDiff> {
    try {
      console.log(`📋 Fetching diff for commit ${sha.substring(0, 7)}...`);

      const response = await (this.githubService as any).client.get(
        `/repos/${owner}/${repo}/commits/${sha}`,
        {
          headers: {
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      const commit = response.data;
      const changedFiles: ChangedFile[] = commit.files.map((file: any) => ({
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        patch: file.patch,
      }));

      return {
        sha: commit.sha,
        timestamp: new Date(commit.commit.author.date).getTime(),
        filesChanged: changedFiles.length,
        additions: commit.stats.additions,
        deletions: commit.stats.deletions,
        changedFiles,
      };
    } catch (error) {
      console.error(`❌ Failed to fetch commit diff: ${error}`);
      throw error;
    }
  }

  /**
   * Fetch multiple commit diffs in parallel
   */
  async fetchCommitDiffs(
    owner: string,
    repo: string,
    commits: CommitInfo[],
    concurrency: number = 3
  ): Promise<CommitDiff[]> {
    const diffs: CommitDiff[] = [];

    // Fetch in batches to respect rate limits
    for (let i = 0; i < commits.length; i += concurrency) {
      const batch = commits.slice(i, i + concurrency);
      const batchDiffs = await Promise.all(
        batch.map((commit) =>
          this.fetchCommitDiff(owner, repo, commit.sha).catch((err) => {
            console.warn(
              `⚠️ Failed to fetch diff for ${commit.sha}: ${err.message}`
            );
            return null;
          })
        )
      );

      diffs.push(...(batchDiffs.filter(Boolean) as CommitDiff[]));
    }

    return diffs;
  }

  /**
   * Build commit timeline with statistics
   */
  async buildCommitTimeline(
    owner: string,
    repo: string,
    options: CommitHistoryOptions = {}
  ): Promise<CommitTimeline> {
    const { maxCommits = 50, includeDiffs = false } = options;

    // Fetch commit history
    const commits = await this.fetchCommitHistory(owner, repo, { maxCommits });

    if (commits.length === 0) {
      throw new Error("No commits found in repository");
    }

    // Calculate statistics
    const stats = this.calculateStats(commits, []);

    // Optionally fetch diffs for more detailed stats
    let diffs: CommitDiff[] = [];
    if (includeDiffs && commits.length > 0) {
      // Only fetch diffs for a subset to avoid rate limiting
      const diffCommits = commits.slice(
        Math.max(0, commits.length - 10),
        commits.length
      );
      diffs = await this.fetchCommitDiffs(owner, repo, diffCommits, 2);
    }

    // Update stats with diff information if available
    if (diffs.length > 0) {
      stats.totalAdditions = diffs.reduce((sum, d) => sum + d.additions, 0);
      stats.totalDeletions = diffs.reduce((sum, d) => sum + d.deletions, 0);
    }

    return {
      commits,
      stats,
      snapshots: [], // Snapshots would be populated when analyzing actual code
    };
  }

  /**
   * Calculate statistics from commit data
   */
  private calculateStats(
    commits: CommitInfo[],
    diffs: CommitDiff[]
  ): CommitHistoryStats {
    const filesChanged = new Set<string>();

    diffs.forEach((diff) => {
      diff.changedFiles.forEach((file) => {
        filesChanged.add(file.filename);
      });
    });

    const totalAdditions = diffs.reduce((sum, d) => sum + d.additions, 0);
    const totalDeletions = diffs.reduce((sum, d) => sum + d.deletions, 0);

    return {
      totalCommits: commits.length,
      dateRange: {
        earliest: commits.length > 0 ? commits[0].timestamp : Date.now(),
        latest:
          commits.length > 0
            ? commits[commits.length - 1].timestamp
            : Date.now(),
      },
      filesChanged,
      totalAdditions,
      totalDeletions,
      averageChangesPerCommit:
        diffs.length > 0
          ? Math.round((totalAdditions + totalDeletions) / diffs.length)
          : 0,
    };
  }

  /**
   * Get unique authors from commit history
   */
  getAuthors(commits: CommitInfo[]): Set<string> {
    return new Set(commits.map((c) => c.author.name));
  }

  /**
   * Get commits grouped by date
   */
  groupCommitsByDate(commits: CommitInfo[]): Map<string, CommitInfo[]> {
    const grouped = new Map<string, CommitInfo[]>();

    commits.forEach((commit) => {
      const date = new Date(commit.timestamp).toISOString().split("T")[0];
      if (!grouped.has(date)) {
        grouped.set(date, []);
      }
      grouped.get(date)!.push(commit);
    });

    return grouped;
  }

  /**
   * Get commits grouped by author
   */
  groupCommitsByAuthor(commits: CommitInfo[]): Map<string, CommitInfo[]> {
    const grouped = new Map<string, CommitInfo[]>();

    commits.forEach((commit) => {
      const author = commit.author.name;
      if (!grouped.has(author)) {
        grouped.set(author, []);
      }
      grouped.get(author)!.push(commit);
    });

    return grouped;
  }

  /**
   * Clear the commit cache
   */
  clearCache(): void {
    this.commitCache.clear();
  }
}
