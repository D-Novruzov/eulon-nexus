/**
 * useLocalGraphPersistence Hook
 *
 * React hook for managing client-side graph persistence in IndexedDB.
 * Enables instant graph restoration on page reload.
 */

import { useState, useCallback, useEffect } from "react";
import { GraphPersistence, type PersistedGraph } from "../../lib/graph-persistence.ts";
import type { KnowledgeGraph } from "../../core/graph/types.ts";
import { SimpleKnowledgeGraph } from "../../core/graph/graph.ts";

interface UseLocalGraphPersistenceState {
  isLoading: boolean;
  isRestoring: boolean;
  lastRepoId: string | null;
  cachedGraphs: Array<{
    repoId: string;
    projectName?: string;
    nodeCount: number;
    relationshipCount: number;
    createdAt: number;
  }>;
  error: string | null;
}

interface UseLocalGraphPersistenceReturn extends UseLocalGraphPersistenceState {
  restoreLastSession: () => Promise<{
    graph: KnowledgeGraph;
    repoId: string;
    projectName?: string;
  } | null>;
  restoreGraph: (repoId: string) => Promise<KnowledgeGraph | null>;
  clearAllCached: () => Promise<void>;
  clearGraph: (repoId: string) => Promise<void>;
  refreshCachedList: () => Promise<void>;
  getStorageStats: () => Promise<{
    totalGraphs: number;
    totalNodes: number;
    totalRelationships: number;
  }>;
}

export function useLocalGraphPersistence(): UseLocalGraphPersistenceReturn {
  const [state, setState] = useState<UseLocalGraphPersistenceState>({
    isLoading: true,
    isRestoring: false,
    lastRepoId: null,
    cachedGraphs: [],
    error: null,
  });

  // Load cached graphs list and last repo on mount
  useEffect(() => {
    const initialize = async () => {
      try {
        const lastRepoId = localStorage.getItem("gitnexus_last_repo");
        const cachedGraphs = await GraphPersistence.getAllMetadata();

        setState((prev) => ({
          ...prev,
          isLoading: false,
          lastRepoId,
          cachedGraphs,
        }));
      } catch (error) {
        console.error("Failed to initialize graph persistence:", error);
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : "Initialization failed",
        }));
      }
    };

    initialize();
  }, []);

  const restoreLastSession = useCallback(async () => {
    const lastRepoId = localStorage.getItem("gitnexus_last_repo");

    if (!lastRepoId) {
      console.log("ℹ️ No last session to restore");
      return null;
    }

    setState((prev) => ({ ...prev, isRestoring: true, error: null }));

    try {
      const persisted = await GraphPersistence.load(lastRepoId);

      if (!persisted) {
        console.log("ℹ️ Last session graph not found in cache");
        setState((prev) => ({ ...prev, isRestoring: false }));
        return null;
      }

      const graph = restoreGraphFromPersisted(persisted);

      setState((prev) => ({ ...prev, isRestoring: false }));

      return {
        graph,
        repoId: lastRepoId,
        projectName: persisted.projectName,
      };
    } catch (error) {
      console.error("Failed to restore last session:", error);
      setState((prev) => ({
        ...prev,
        isRestoring: false,
        error: error instanceof Error ? error.message : "Restore failed",
      }));
      return null;
    }
  }, []);

  const restoreGraph = useCallback(async (repoId: string) => {
    setState((prev) => ({ ...prev, isRestoring: true, error: null }));

    try {
      const persisted = await GraphPersistence.load(repoId);

      if (!persisted) {
        setState((prev) => ({ ...prev, isRestoring: false }));
        return null;
      }

      const graph = restoreGraphFromPersisted(persisted);

      // Update last repo
      localStorage.setItem("gitnexus_last_repo", repoId);

      setState((prev) => ({
        ...prev,
        isRestoring: false,
        lastRepoId: repoId,
      }));

      return graph;
    } catch (error) {
      console.error("Failed to restore graph:", error);
      setState((prev) => ({
        ...prev,
        isRestoring: false,
        error: error instanceof Error ? error.message : "Restore failed",
      }));
      return null;
    }
  }, []);

  const clearAllCached = useCallback(async () => {
    try {
      await GraphPersistence.clearAll();
      localStorage.removeItem("gitnexus_last_repo");

      setState((prev) => ({
        ...prev,
        cachedGraphs: [],
        lastRepoId: null,
      }));

      console.log("✅ Cleared all cached graphs");
    } catch (error) {
      console.error("Failed to clear cached graphs:", error);
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Clear failed",
      }));
    }
  }, []);

  const clearGraph = useCallback(async (repoId: string) => {
    try {
      await GraphPersistence.clear(repoId);

      // Update cached list
      const cachedGraphs = await GraphPersistence.getAllMetadata();

      // Clear last repo if it matches
      const lastRepoId = localStorage.getItem("gitnexus_last_repo");
      if (lastRepoId === repoId) {
        localStorage.removeItem("gitnexus_last_repo");
      }

      setState((prev) => ({
        ...prev,
        cachedGraphs,
        lastRepoId: lastRepoId === repoId ? null : prev.lastRepoId,
      }));

      console.log(`✅ Cleared cached graph: ${repoId}`);
    } catch (error) {
      console.error("Failed to clear graph:", error);
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Clear failed",
      }));
    }
  }, []);

  const refreshCachedList = useCallback(async () => {
    try {
      const cachedGraphs = await GraphPersistence.getAllMetadata();
      setState((prev) => ({ ...prev, cachedGraphs }));
    } catch (error) {
      console.error("Failed to refresh cached list:", error);
    }
  }, []);

  const getStorageStats = useCallback(async () => {
    return GraphPersistence.getStorageStats();
  }, []);

  return {
    ...state,
    restoreLastSession,
    restoreGraph,
    clearAllCached,
    clearGraph,
    refreshCachedList,
    getStorageStats,
  };
}

/**
 * Helper to restore a KnowledgeGraph from persisted data
 */
function restoreGraphFromPersisted(persisted: PersistedGraph): KnowledgeGraph {
  const graph = new SimpleKnowledgeGraph();

  for (const node of persisted.nodes) {
    graph.addNode(node);
  }

  for (const rel of persisted.relationships) {
    graph.addRelationship(rel);
  }

  console.log(
    `✅ Restored graph: ${persisted.nodes.length} nodes, ${persisted.relationships.length} relationships`
  );

  return graph;
}

