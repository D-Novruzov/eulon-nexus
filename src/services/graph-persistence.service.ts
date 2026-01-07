/**
 * Graph Persistence Service
 *
 * Frontend service that connects to the backend for persistent graph storage.
 * Works alongside the commit history feature to enable graph versioning.
 */

import type {
  KnowledgeGraph,
  GraphNode,
  GraphRelationship,
} from "../core/graph/types.ts";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

export interface GraphMetadata {
  id: string;
  repoOwner: string;
  repoName: string;
  commitSha: string;
  commitNumber: number;
  commitMessage: string;
  commitDate: string;
  createdAt: string;
  nodeCount: number;
  relationshipCount: number;
  dbPath: string;
}

export interface AnalysisHistoryEntry {
  id: string;
  repoFullName: string;
  commits: GraphMetadata[];
  lastUpdated: string;
}

export interface GraphComparisonResult {
  nodesAdded: GraphNode[];
  nodesRemoved: GraphNode[];
  relationshipsAdded: GraphRelationship[];
  relationshipsRemoved: GraphRelationship[];
  summary: {
    nodesAdded: number;
    nodesRemoved: number;
    relationshipsAdded: number;
    relationshipsRemoved: number;
  };
}

export class GraphPersistenceService {
  private static instance: GraphPersistenceService;

  private constructor() {}

  public static getInstance(): GraphPersistenceService {
    if (!GraphPersistenceService.instance) {
      GraphPersistenceService.instance = new GraphPersistenceService();
    }
    return GraphPersistenceService.instance;
  }

  /**
   * Store a graph for a specific commit
   */
  async storeGraph(
    owner: string,
    repo: string,
    commitSha: string,
    commitMessage: string,
    commitDate: string,
    graph: KnowledgeGraph
  ): Promise<GraphMetadata> {
    const response = await fetch(`${BACKEND_URL}/api/analysis/store`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        owner,
        repo,
        commitSha,
        commitMessage,
        commitDate,
        graph: {
          nodes: graph.nodes,
          relationships: graph.relationships,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to store graph");
    }

    const result = await response.json();
    return result.metadata;
  }

  /**
   * Get all analysis history
   */
  async getAllHistory(): Promise<AnalysisHistoryEntry[]> {
    const response = await fetch(`${BACKEND_URL}/api/analysis/history`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to get history");
    }

    const result = await response.json();
    return result.history;
  }

  /**
   * Get history for a specific repository
   */
  async getRepoHistory(
    owner: string,
    repo: string
  ): Promise<AnalysisHistoryEntry | null> {
    const response = await fetch(
      `${BACKEND_URL}/api/analysis/repo/${owner}/${repo}`
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to get repository history");
    }

    const result = await response.json();
    return result.history;
  }

  /**
   * Load a graph for a specific commit
   */
  async loadGraph(
    owner: string,
    repo: string,
    commitSha: string
  ): Promise<KnowledgeGraph | null> {
    const response = await fetch(
      `${BACKEND_URL}/api/analysis/graph/${owner}/${repo}/${commitSha}`
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to load graph");
    }

    const result = await response.json();
    return result.graph;
  }

  /**
   * Compare two commits
   */
  async compareCommits(
    owner: string,
    repo: string,
    commitSha1: string,
    commitSha2: string
  ): Promise<GraphComparisonResult | null> {
    const response = await fetch(`${BACKEND_URL}/api/analysis/compare`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        owner,
        repo,
        commitSha1,
        commitSha2,
      }),
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to compare commits");
    }

    const result = await response.json();
    return result.comparison;
  }

  /**
   * Delete a graph
   */
  async deleteGraph(
    owner: string,
    repo: string,
    commitSha: string
  ): Promise<boolean> {
    const response = await fetch(
      `${BACKEND_URL}/api/analysis/graph/${owner}/${repo}/${commitSha}`,
      { method: "DELETE" }
    );

    return response.ok;
  }

  /**
   * Store current graph after analysis (helper for integration)
   */
  async storeCurrentAnalysis(
    repoUrl: string,
    graph: KnowledgeGraph,
    commitInfo?: { sha: string; message: string; date: string }
  ): Promise<GraphMetadata | null> {
    try {
      // Extract owner/repo from URL
      const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
      if (!match) {
        console.warn("Could not extract owner/repo from URL:", repoUrl);
        return null;
      }

      const [, owner, repo] = match;
      const commitSha = commitInfo?.sha || `snapshot-${Date.now()}`;
      const commitMessage = commitInfo?.message || "Manual analysis";
      const commitDate = commitInfo?.date || new Date().toISOString();

      return await this.storeGraph(
        owner,
        repo,
        commitSha,
        commitMessage,
        commitDate,
        graph
      );
    } catch (error) {
      console.error("Failed to store analysis:", error);
      return null;
    }
  }
}

export const graphPersistenceService = GraphPersistenceService.getInstance();
