/**
 * useCommitHistory Hook
 *
 * React hook for managing commit history fetching and state management.
 * Provides loading, error handling, and caching functionality.
 */

import { useState, useCallback, useRef } from "react";
import type { CommitTimeline } from "../../core/graph/commit-history.types.ts";
import { CommitHistoryService } from "../../services/commit-history.service.ts";

interface UseCommitHistoryOptions {
  maxCommits?: number;
  includeDiffs?: boolean;
}

export const useCommitHistory = (githubToken?: string) => {
  const [timeline, setTimeline] = useState<CommitTimeline | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const serviceRef = useRef<CommitHistoryService | null>(null);

  const initializeService = useCallback(() => {
    if (!serviceRef.current) {
      serviceRef.current = new CommitHistoryService(githubToken);
    }
    return serviceRef.current;
  }, [githubToken]);

  const fetchCommitHistory = useCallback(
    async (
      owner: string,
      repo: string,
      options: UseCommitHistoryOptions = {}
    ) => {
      setIsLoading(true);
      setError(null);
      try {
        const service = initializeService();
        const commitTimeline = await service.buildCommitTimeline(owner, repo, {
          maxCommits: options.maxCommits || 100,
          includeDiffs: options.includeDiffs || false,
        });
        setTimeline(commitTimeline);
        return commitTimeline;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to fetch commit history";
        setError(errorMessage);
        console.error("Commit history error:", errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [initializeService]
  );

  const clearHistory = useCallback(() => {
    setTimeline(null);
    setError(null);
  }, []);

  const clearCache = useCallback(() => {
    const service = initializeService();
    service.clearCache();
  }, [initializeService]);

  return {
    timeline,
    isLoading,
    error,
    fetchCommitHistory,
    clearHistory,
    clearCache,
  };
};
