import { GitHubService, type CompleteRepositoryStructure } from "./github.ts";
import {
  GitHubArchiveService,
  type ArchiveRepositoryStructure,
} from "./github-archive.ts";
import { ZipService, type CompleteZipStructure } from "./zip.ts";
import { getIngestionWorker } from "../lib/workerUtils.ts";
import type { KnowledgeGraph } from "../core/graph/types.ts";
import { databaseResetService } from "./database-reset.service.ts";

export interface IngestionOptions {
  directoryFilter?: string;
  fileExtensions?: string;
  onProgress?: (message: string) => void;
  useArchiveDownload?: boolean; // New option to use archive (ZIP) download
  branch?: string; // Branch to download (default: 'main')
  ref?: string; // Commit SHA or ref to download (takes precedence over branch)
}

export interface IngestionResult {
  graph: KnowledgeGraph;
  fileContents: Map<string, string>;
}

export class IngestionService {
  private githubService: GitHubService;
  private githubArchiveService: GitHubArchiveService;
  private zipService: ZipService;
  private githubToken?: string;

  constructor(githubToken?: string) {
    this.githubToken = githubToken;
    this.githubService = new GitHubService(githubToken);
    this.githubArchiveService = GitHubArchiveService.getInstance();
    this.zipService = new ZipService();
  }

  async processGitHubRepo(
    githubUrl: string,
    options: IngestionOptions = {}
  ): Promise<IngestionResult> {
    const { onProgress, useArchiveDownload = true, branch = "main", ref } = options;

    // Reset database for fresh start
    await databaseResetService.resetDatabase({ onProgress });

    // Parse GitHub URL
    const match = githubUrl.match(
      /^https:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/.*)?$/
    );
    if (!match) {
      throw new Error("Invalid GitHub repository URL");
    }

    const [, owner, repo] = match;

    let structure: CompleteRepositoryStructure | ArchiveRepositoryStructure;

    // Use archive download by default (much faster, only 1 API call!)
    if (useArchiveDownload) {
      onProgress?.("Downloading repository archive (ZIP)...");

      try {
        // Use ref (commit SHA) if provided, otherwise use branch
        const refOrBranch = ref || branch;
        structure = await this.githubArchiveService.getRepositoryArchive(
          owner,
          repo,
          refOrBranch,
          (progress) => {
            onProgress?.(progress.message);
          },
          {
            useBackendProxy: !!this.githubToken,
            accessToken: this.githubToken,
            isCommitSha: !!ref, // Indicate if this is a commit SHA vs branch
          }
        );

        console.log(
          `✅ Archive download completed: ${structure.allPaths.length} paths, ${structure.fileContents.size} files`
        );
      } catch (error) {
        console.warn(
          "⚠️ Archive download failed, falling back to API method:",
          error
        );
        onProgress?.("Archive download failed, using API method (slower)...");
        structure = await this.githubService.getCompleteRepositoryStructure(
          owner,
          repo
        );
      }
    } else {
      // Legacy API method (slower, many API calls)
      onProgress?.("Discovering complete repository structure (API method)...");
      structure = await this.githubService.getCompleteRepositoryStructure(
        owner,
        repo
      );
    }

    onProgress?.(
      `Discovered ${structure.allPaths.length} paths, ${structure.fileContents.size} files. Processing...`
    );

    // Prepare data for pipeline
    const projectName = `${owner}/${repo}`;
    const projectRoot = "";

    // The pipeline now receives ALL paths (files + directories)
    // Filtering will happen during parsing, not here
    const filePaths = structure.allPaths;
    const fileContents = structure.fileContents;

    onProgress?.("Generating knowledge graph...");

    // Create worker and process
    const worker = await getIngestionWorker();

    try {
      const result = await worker.processRepository({
        projectName,
        projectRoot,
        filePaths,
        fileContents: fileContents,
      });

      if (!result.success) {
        throw new Error(result.error || "Processing failed");
      }

      // Recreate the appropriate graph based on worker metadata
      const graph = await this.recreateGraphFromResult(result);

      return {
        graph,
        fileContents,
      };
    } finally {
      // Clean up worker
      if ("terminate" in worker) {
        (worker as { terminate: () => void }).terminate();
      }
    }
  }

  async processZipFile(
    file: File,
    options: IngestionOptions = {}
  ): Promise<IngestionResult> {
    const { onProgress } = options;

    // Reset database for fresh start
    await databaseResetService.resetDatabase({ onProgress });

    onProgress?.("Discovering complete ZIP structure...");

    // Get complete ZIP structure (all paths + file contents)
    const structure: CompleteZipStructure =
      await this.zipService.extractCompleteStructure(file);

    // Normalize ZIP paths to remove common top-level folder
    const normalizedStructure = this.normalizeZipPaths(structure);

    onProgress?.(
      `Discovered ${normalizedStructure.allPaths.length} paths, ${normalizedStructure.fileContents.size} files. Processing...`
    );

    // Prepare data for pipeline
    const projectName = file.name.replace(".zip", "");
    const projectRoot = "";

    // The pipeline now receives ALL paths (files + directories)
    // Filtering will happen during parsing, not here
    const filePaths = normalizedStructure.allPaths;
    const fileContents = normalizedStructure.fileContents;

    onProgress?.("Generating knowledge graph...");

    // Create worker and process
    const worker = await getIngestionWorker();

    try {
      const result = await worker.processRepository({
        projectName,
        projectRoot,
        filePaths,
        fileContents: fileContents,
      });

      if (!result.success) {
        throw new Error(result.error || "Processing failed");
      }

      // Recreate the appropriate graph based on worker metadata
      const graph = await this.recreateGraphFromResult(result);

      return {
        graph,
        fileContents,
      };
    } finally {
      // Clean up worker
      if ("terminate" in worker) {
        (worker as { terminate: () => void }).terminate();
      }
    }
  }

  private normalizeZipPaths(
    structure: CompleteZipStructure
  ): CompleteZipStructure {
    const paths = structure.allPaths;

    if (paths.length === 0) {
      return structure;
    }

    // Find common prefix to remove (usually the top-level folder)
    const firstPath = paths[0];
    const pathParts = firstPath.split("/");

    if (pathParts.length <= 1) {
      return structure; // No normalization needed
    }

    // Check if all paths start with the same top-level folder
    const potentialPrefix = pathParts[0] + "/";
    const pathsWithPrefix = paths.filter((path) =>
      path.startsWith(potentialPrefix)
    );

    // If most paths (>80%) have the common prefix, normalize all paths
    if (pathsWithPrefix.length > paths.length * 0.8) {
      console.log(
        `Normalizing ZIP paths: removing common prefix "${potentialPrefix}" from ${pathsWithPrefix.length}/${paths.length} paths`
      );

      // Remove the common prefix from all paths
      const normalizedPaths = paths
        .map((path) => {
          if (path.startsWith(potentialPrefix)) {
            const withoutPrefix = path.substring(potentialPrefix.length);
            return withoutPrefix || path; // Keep original if normalization would result in empty string
          }
          // For paths without prefix, keep as-is but filter out the bare container name
          return path === pathParts[0] ? "" : path;
        })
        .filter((path) => path.length > 0); // Remove empty paths

      // Normalize file contents map
      const normalizedContents = new Map<string, string>();
      for (const [originalPath, content] of structure.fileContents) {
        let normalizedPath = originalPath;
        if (originalPath.startsWith(potentialPrefix)) {
          normalizedPath = originalPath.substring(potentialPrefix.length);
        } else if (originalPath === pathParts[0]) {
          // Skip the bare container directory
          continue;
        }

        if (normalizedPath && normalizedPath.length > 0) {
          normalizedContents.set(normalizedPath, content);
        }
      }

      return {
        allPaths: normalizedPaths,
        fileContents: normalizedContents,
      };
    }

    return structure; // No normalization if prefix isn't common enough
  }

  /**
   * Recreate the appropriate graph type based on worker result metadata
   */
  private async recreateGraphFromResult(result: any): Promise<KnowledgeGraph> {
    console.log(
      `📊 Recreating graph: type=${result.graphType}, kuzuEnabled=${result.kuzuEnabled}`
    );

    if (result.graphType === "DualWriteKnowledgeGraph" && result.kuzuEnabled) {
      try {
        // Recreate DualWriteKnowledgeGraph with KuzuDB
        console.log("🚀 Recreating DualWriteKnowledgeGraph with KuzuDB...");

        // Initialize KuzuDB query engine
        const { KuzuQueryEngine } = await import(
          "../core/graph/kuzu-query-engine.ts"
        );
        const queryEngine = new KuzuQueryEngine({
          enableCache: true,
          cacheSize: 1000,
          cacheTTL: 5 * 60 * 1000, // 5 minutes
        });

        await queryEngine.initialize();

        // Create KuzuDB knowledge graph
        const { KuzuKnowledgeGraph } = await import(
          "../core/graph/kuzu-knowledge-graph.ts"
        );
        const kuzuGraph = new KuzuKnowledgeGraph(queryEngine, {
          enableCache: true,
          batchSize: 100,
          autoCommit: false,
        });

        // Create dual-write graph
        const { DualWriteKnowledgeGraph } = await import(
          "../core/graph/dual-write-knowledge-graph.ts"
        );
        const dualWriteGraph = new DualWriteKnowledgeGraph(kuzuGraph);

        // Add the data from worker result
        (result.nodes || []).forEach((node: any) =>
          dualWriteGraph.addNode(node)
        );
        (result.relationships || []).forEach((rel: any) =>
          dualWriteGraph.addRelationship(rel)
        );

        // Commit to KuzuDB
        await dualWriteGraph.flushKuzuDB();

        console.log(
          "✅ Successfully recreated DualWriteKnowledgeGraph with KuzuDB"
        );
        return dualWriteGraph;
      } catch (error) {
        console.warn(
          "❌ Failed to recreate DualWriteKnowledgeGraph, falling back to SimpleKnowledgeGraph:",
          error
        );
      }
    }

    // Fallback to SimpleKnowledgeGraph
    console.log("📄 Creating SimpleKnowledgeGraph fallback");
    const { SimpleKnowledgeGraph } = await import("../core/graph/graph.ts");
    const simpleGraph = new SimpleKnowledgeGraph();

    // Add nodes and relationships from result
    (result.nodes || []).forEach((node: any) => simpleGraph.addNode(node));
    (result.relationships || []).forEach((rel: any) =>
      simpleGraph.addRelationship(rel)
    );

    return simpleGraph;
  }
}
