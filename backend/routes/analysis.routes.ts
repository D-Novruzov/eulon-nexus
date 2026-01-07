/**
 * Analysis Routes
 *
 * API endpoints for storing and retrieving graph analyses with commit history.
 */

import { Router, type Request, type Response } from "express";
import {
  graphStorageService,
  type StoredGraph,
} from "../services/graph-storage.service.js";

const router = Router();

/**
 * POST /api/analysis/store
 * Store a graph analysis for a commit
 */
router.post("/store", async (req: Request, res: Response) => {
  try {
    const { owner, repo, commitSha, commitMessage, commitDate, graph } =
      req.body;

    if (!owner || !repo || !commitSha || !graph) {
      res.status(400).json({
        error: "Missing required fields: owner, repo, commitSha, graph",
      });
      return;
    }

    // Use JSON storage (more reliable cross-platform)
    const metadata = await graphStorageService.storeGraphAsJSON(
      owner,
      repo,
      commitSha,
      commitMessage || "No message",
      commitDate || new Date().toISOString(),
      graph as StoredGraph
    );

    res.json({
      success: true,
      metadata,
      message: `Graph stored for ${owner}/${repo}@${commitSha.substring(0, 7)}`,
    });
  } catch (error) {
    console.error("Failed to store graph:", error);
    res.status(500).json({
      error: "Failed to store graph",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/analysis/history
 * Get all analysis history
 */
router.get("/history", async (_req: Request, res: Response) => {
  try {
    const history = await graphStorageService.getAllHistory();
    res.json({
      success: true,
      history,
      count: history.length,
    });
  } catch (error) {
    console.error("Failed to get history:", error);
    res.status(500).json({
      error: "Failed to get history",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/analysis/repo/:owner/:repo
 * Get history for a specific repository
 */
router.get("/repo/:owner/:repo", async (req: Request, res: Response) => {
  try {
    const { owner, repo } = req.params;
    const history = await graphStorageService.getRepoHistory(owner, repo);

    if (!history) {
      res.status(404).json({
        error: "No history found for this repository",
      });
      return;
    }

    res.json({
      success: true,
      history,
    });
  } catch (error) {
    console.error("Failed to get repo history:", error);
    res.status(500).json({
      error: "Failed to get repository history",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/analysis/graph/:owner/:repo/:commitSha
 * Load a specific graph
 */
router.get(
  "/graph/:owner/:repo/:commitSha",
  async (req: Request, res: Response) => {
    try {
      const { owner, repo, commitSha } = req.params;
      const graph = await graphStorageService.loadGraph(owner, repo, commitSha);

      if (!graph) {
        res.status(404).json({
          error: "Graph not found for this commit",
        });
        return;
      }

      res.json({
        success: true,
        graph,
      });
    } catch (error) {
      console.error("Failed to load graph:", error);
      res.status(500).json({
        error: "Failed to load graph",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * POST /api/analysis/compare
 * Compare two commits
 */
router.post("/compare", async (req: Request, res: Response) => {
  try {
    const { owner, repo, commitSha1, commitSha2 } = req.body;

    if (!owner || !repo || !commitSha1 || !commitSha2) {
      res.status(400).json({
        error: "Missing required fields: owner, repo, commitSha1, commitSha2",
      });
      return;
    }

    const comparison = await graphStorageService.compareCommits(
      owner,
      repo,
      commitSha1,
      commitSha2
    );

    if (!comparison) {
      res.status(404).json({
        error: "One or both graphs not found",
      });
      return;
    }

    res.json({
      success: true,
      comparison: {
        ...comparison,
        summary: {
          nodesAdded: comparison.nodesAdded.length,
          nodesRemoved: comparison.nodesRemoved.length,
          relationshipsAdded: comparison.relationshipsAdded.length,
          relationshipsRemoved: comparison.relationshipsRemoved.length,
        },
      },
    });
  } catch (error) {
    console.error("Failed to compare commits:", error);
    res.status(500).json({
      error: "Failed to compare commits",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /api/analysis/graph/:owner/:repo/:commitSha
 * Delete a specific graph
 */
router.delete(
  "/graph/:owner/:repo/:commitSha",
  async (req: Request, res: Response) => {
    try {
      const { owner, repo, commitSha } = req.params;
      const deleted = await graphStorageService.deleteGraph(
        owner,
        repo,
        commitSha
      );

      if (!deleted) {
        res.status(404).json({
          error: "Graph not found",
        });
        return;
      }

      res.json({
        success: true,
        message: `Graph deleted for ${owner}/${repo}@${commitSha.substring(
          0,
          7
        )}`,
      });
    } catch (error) {
      console.error("Failed to delete graph:", error);
      res.status(500).json({
        error: "Failed to delete graph",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

export default router;
