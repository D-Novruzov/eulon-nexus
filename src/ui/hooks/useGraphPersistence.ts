/**
 * useGraphPersistence Hook
 *
 * React hook for managing persistent graph storage.
 * Works with the backend to store/load graphs with commit history.
 */

import { useState, useCallback } from "react";
import {
  graphPersistenceService,
  type GraphMetadata,
  type AnalysisHistoryEntry,
  type GraphComparisonResult,
} from "../../services/graph-persistence.service.ts";
import type { KnowledgeGraph } from "../../core/graph/types.ts";

interface UseGraphPersistenceState {
  history: AnalysisHistoryEntry[];
  currentRepoHistory: AnalysisHistoryEntry | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
}

interface UseGraphPersistenceReturn extends UseGraphPersistenceState {
  // Actions
  storeGraph: (
    owner: string,
    repo: string,
    commitSha: string,
    commitMessage: string,
    commitDate: string,
    graph: KnowledgeGraph
  ) => Promise<GraphMetadata | null>;
  loadGraph: (
    owner: string,
    repo: string,
    commitSha: string
  ) => Promise<KnowledgeGraph | null>;
  fetchAllHistory: () => Promise<void>;
  fetchRepoHistory: (owner: string, repo: string) => Promise<void>;
  compareCommits: (
    owner: string,
    repo: string,
    commitSha1: string,
    commitSha2: string
  ) => Promise<GraphComparisonResult | null>;
  deleteGraph: (
    owner: string,
    repo: string,
    commitSha: string
  ) => Promise<boolean>;
  clearError: () => void;
}

export function useGraphPersistence(): UseGraphPersistenceReturn {
  const [state, setState] = useState<UseGraphPersistenceState>({
    history: [],
    currentRepoHistory: null,
    isLoading: false,
    isSaving: false,
    error: null,
  });

  const storeGraph = useCallback(
    async (
      owner: string,
      repo: string,
      commitSha: string,
      commitMessage: string,
      commitDate: string,
      graph: KnowledgeGraph
    ): Promise<GraphMetadata | null> => {
      setState((prev) => ({ ...prev, isSaving: true, error: null }));

      try {
        const metadata = await graphPersistenceService.storeGraph(
          owner,
          repo,
          commitSha,
          commitMessage,
          commitDate,
          graph
        );

        console.log(
          `✅ Graph stored: ${owner}/${repo}@${commitSha.substring(0, 7)}`
        );

        // Refresh repo history
        const updatedHistory = await graphPersistenceService.getRepoHistory(
          owner,
          repo
        );
        setState((prev) => ({
          ...prev,
          isSaving: false,
          currentRepoHistory: updatedHistory,
        }));

        return metadata;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to store graph";
        console.error("Store graph error:", error);
        setState((prev) => ({ ...prev, isSaving: false, error: message }));
        return null;
      }
    },
    []
  );

  const loadGraph = useCallback(
    async (
      owner: string,
      repo: string,
      commitSha: string
    ): Promise<KnowledgeGraph | null> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const graph = await graphPersistenceService.loadGraph(
          owner,
          repo,
          commitSha
        );
        setState((prev) => ({ ...prev, isLoading: false }));
        return graph;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to load graph";
        console.error("Load graph error:", error);
        setState((prev) => ({ ...prev, isLoading: false, error: message }));
        return null;
      }
    },
    []
  );

  const fetchAllHistory = useCallback(async (): Promise<void> => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const history = await graphPersistenceService.getAllHistory();
      setState((prev) => ({ ...prev, isLoading: false, history }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to fetch history";
      console.error("Fetch history error:", error);
      setState((prev) => ({ ...prev, isLoading: false, error: message }));
    }
  }, []);

  const fetchRepoHistory = useCallback(
    async (owner: string, repo: string): Promise<void> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const history = await graphPersistenceService.getRepoHistory(
          owner,
          repo
        );
        setState((prev) => ({
          ...prev,
          isLoading: false,
          currentRepoHistory: history,
        }));
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to fetch repo history";
        console.error("Fetch repo history error:", error);
        setState((prev) => ({ ...prev, isLoading: false, error: message }));
      }
    },
    []
  );

  const compareCommits = useCallback(
    async (
      owner: string,
      repo: string,
      commitSha1: string,
      commitSha2: string
    ): Promise<GraphComparisonResult | null> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const result = await graphPersistenceService.compareCommits(
          owner,
          repo,
          commitSha1,
          commitSha2
        );
        setState((prev) => ({ ...prev, isLoading: false }));
        return result;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to compare commits";
        console.error("Compare commits error:", error);
        setState((prev) => ({ ...prev, isLoading: false, error: message }));
        return null;
      }
    },
    []
  );

  const deleteGraph = useCallback(
    async (
      owner: string,
      repo: string,
      commitSha: string
    ): Promise<boolean> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const success = await graphPersistenceService.deleteGraph(
          owner,
          repo,
          commitSha
        );

        if (success) {
          // Refresh history
          const updatedHistory = await graphPersistenceService.getRepoHistory(
            owner,
            repo
          );
          setState((prev) => ({
            ...prev,
            isLoading: false,
            currentRepoHistory: updatedHistory,
          }));
        } else {
          setState((prev) => ({ ...prev, isLoading: false }));
        }

        return success;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to delete graph";
        console.error("Delete graph error:", error);
        setState((prev) => ({ ...prev, isLoading: false, error: message }));
        return false;
      }
    },
    []
  );

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    storeGraph,
    loadGraph,
    fetchAllHistory,
    fetchRepoHistory,
    compareCommits,
    deleteGraph,
    clearError,
  };
}
