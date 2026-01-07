/**
 * Graph Storage Service
 *
 * Handles persistent storage of knowledge graphs using KuzuDB on the server.
 * Each commit/analysis gets its own graph that persists to disk.
 */

import kuzu from "kuzu";
import { promises as fs } from "fs";
import path from "path";

export interface GraphNode {
  id: string;
  label: string;
  properties: Record<string, any>;
}

export interface GraphRelationship {
  id: string;
  type: string;
  source: string;
  target: string;
  properties: Record<string, any>;
}

export interface StoredGraph {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
}

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

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const GRAPHS_DIR = path.join(DATA_DIR, "graphs");
const METADATA_FILE = path.join(DATA_DIR, "analysis-metadata.json");

export class GraphStorageService {
  private static instance: GraphStorageService;
  private metadata: Map<string, AnalysisHistoryEntry> = new Map();
  private initialized = false;

  private constructor() {}

  public static getInstance(): GraphStorageService {
    if (!GraphStorageService.instance) {
      GraphStorageService.instance = new GraphStorageService();
    }
    return GraphStorageService.instance;
  }

  /**
   * Initialize the storage service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Create data directories
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.mkdir(GRAPHS_DIR, { recursive: true });

    // Load existing metadata
    await this.loadMetadata();

    this.initialized = true;
    console.log("📁 Graph storage service initialized");
    console.log(`   Data directory: ${DATA_DIR}`);
    console.log(`   Graphs directory: ${GRAPHS_DIR}`);
  }

  /**
   * Load metadata from disk
   */
  private async loadMetadata(): Promise<void> {
    try {
      const data = await fs.readFile(METADATA_FILE, "utf-8");
      const entries: AnalysisHistoryEntry[] = JSON.parse(data);
      entries.forEach((entry) => {
        this.metadata.set(entry.repoFullName, entry);
      });
      console.log(`📂 Loaded ${entries.length} repository histories`);
    } catch (error) {
      // File doesn't exist yet, start fresh
      console.log("📂 No existing metadata, starting fresh");
    }
  }

  /**
   * Save metadata to disk
   */
  private async saveMetadata(): Promise<void> {
    const entries = Array.from(this.metadata.values());
    await fs.writeFile(METADATA_FILE, JSON.stringify(entries, null, 2));
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
    graph: StoredGraph
  ): Promise<GraphMetadata> {
    await this.initialize();

    const repoFullName = `${owner}/${repo}`;
    const graphId = `${owner}_${repo}_${commitSha.substring(0, 7)}`;
    const dbPath = path.join(GRAPHS_DIR, graphId);

    // Create KuzuDB database
    const db = new kuzu.Database(dbPath);
    const conn = new kuzu.Connection(db);

    try {
      // Create schema
      await conn.query(`
        CREATE NODE TABLE IF NOT EXISTS CodeElement (
          id STRING PRIMARY KEY,
          label STRING,
          name STRING,
          filePath STRING,
          startLine INT64,
          endLine INT64,
          language STRING,
          elementType STRING
        )
      `);

      await conn.query(`
        CREATE REL TABLE IF NOT EXISTS CodeRelationship (
          FROM CodeElement TO CodeElement,
          relType STRING,
          properties STRING
        )
      `);

      // Insert nodes
      for (const node of graph.nodes) {
        const props = node.properties || {};
        await conn.query(
          `
          MERGE (n:CodeElement {
            id: $id,
            label: $label,
            name: $name,
            filePath: $filePath,
            startLine: $startLine,
            endLine: $endLine,
            language: $language,
            elementType: $elementType
          })
        `,
          {
            id: node.id,
            label: node.label,
            name: props.name || "",
            filePath: props.filePath || props.path || "",
            startLine: props.startLine || 0,
            endLine: props.endLine || 0,
            language: props.language || "",
            elementType: node.label,
          }
        );
      }

      // Insert relationships
      for (const rel of graph.relationships) {
        await conn.query(
          `
          MATCH (a:CodeElement {id: $source})
          MATCH (b:CodeElement {id: $target})
          MERGE (a)-[r:CodeRelationship {relType: $relType, properties: $props}]->(b)
        `,
          {
            source: rel.source,
            target: rel.target,
            relType: rel.type,
            props: JSON.stringify(rel.properties || {}),
          }
        );
      }

      console.log(`✅ Stored graph in KuzuDB: ${dbPath}`);
    } finally {
      // KuzuDB auto-persists, just need to ensure cleanup
    }

    // Get or create history entry
    let historyEntry = this.metadata.get(repoFullName);
    if (!historyEntry) {
      historyEntry = {
        id: `${owner}_${repo}`,
        repoFullName,
        commits: [],
        lastUpdated: new Date().toISOString(),
      };
    }

    // Calculate commit number
    const commitNumber = historyEntry.commits.length + 1;

    // Create metadata
    const graphMeta: GraphMetadata = {
      id: graphId,
      repoOwner: owner,
      repoName: repo,
      commitSha,
      commitNumber,
      commitMessage,
      commitDate,
      createdAt: new Date().toISOString(),
      nodeCount: graph.nodes.length,
      relationshipCount: graph.relationships.length,
      dbPath,
    };

    // Check if this commit already exists
    const existingIndex = historyEntry.commits.findIndex(
      (c) => c.commitSha === commitSha
    );
    if (existingIndex >= 0) {
      historyEntry.commits[existingIndex] = graphMeta;
    } else {
      historyEntry.commits.push(graphMeta);
    }

    historyEntry.lastUpdated = new Date().toISOString();
    this.metadata.set(repoFullName, historyEntry);
    await this.saveMetadata();

    return graphMeta;
  }

  /**
   * Store graph as JSON (fallback if KuzuDB has issues)
   */
  async storeGraphAsJSON(
    owner: string,
    repo: string,
    commitSha: string,
    commitMessage: string,
    commitDate: string,
    graph: StoredGraph
  ): Promise<GraphMetadata> {
    await this.initialize();

    const repoFullName = `${owner}/${repo}`;
    const graphId = `${owner}_${repo}_${commitSha.substring(0, 7)}`;
    const dbPath = path.join(GRAPHS_DIR, graphId);

    // Create directory and store as JSON
    await fs.mkdir(dbPath, { recursive: true });
    await fs.writeFile(
      path.join(dbPath, "graph.json"),
      JSON.stringify(graph, null, 2)
    );

    console.log(`✅ Stored graph as JSON: ${dbPath}`);

    // Get or create history entry
    let historyEntry = this.metadata.get(repoFullName);
    if (!historyEntry) {
      historyEntry = {
        id: `${owner}_${repo}`,
        repoFullName,
        commits: [],
        lastUpdated: new Date().toISOString(),
      };
    }

    const commitNumber = historyEntry.commits.length + 1;

    const graphMeta: GraphMetadata = {
      id: graphId,
      repoOwner: owner,
      repoName: repo,
      commitSha,
      commitNumber,
      commitMessage,
      commitDate,
      createdAt: new Date().toISOString(),
      nodeCount: graph.nodes.length,
      relationshipCount: graph.relationships.length,
      dbPath,
    };

    const existingIndex = historyEntry.commits.findIndex(
      (c) => c.commitSha === commitSha
    );
    if (existingIndex >= 0) {
      historyEntry.commits[existingIndex] = graphMeta;
    } else {
      historyEntry.commits.push(graphMeta);
    }

    historyEntry.lastUpdated = new Date().toISOString();
    this.metadata.set(repoFullName, historyEntry);
    await this.saveMetadata();

    return graphMeta;
  }

  /**
   * Load a graph for a specific commit
   */
  async loadGraph(
    owner: string,
    repo: string,
    commitSha: string
  ): Promise<StoredGraph | null> {
    await this.initialize();

    const repoFullName = `${owner}/${repo}`;
    const historyEntry = this.metadata.get(repoFullName);

    if (!historyEntry) {
      return null;
    }

    const graphMeta = historyEntry.commits.find(
      (c) => c.commitSha === commitSha
    );
    if (!graphMeta) {
      return null;
    }

    // Try to load from JSON first (simpler)
    try {
      const jsonPath = path.join(graphMeta.dbPath, "graph.json");
      const data = await fs.readFile(jsonPath, "utf-8");
      return JSON.parse(data);
    } catch {
      // Try KuzuDB
      try {
        const db = new kuzu.Database(graphMeta.dbPath);
        const conn = new kuzu.Connection(db);

        // Query nodes
        const nodesResult = await conn.query("MATCH (n:CodeElement) RETURN n");
        const nodes: GraphNode[] = [];
        while (nodesResult.hasNext()) {
          const row = await nodesResult.getNext();
          const node = row[0];
          nodes.push({
            id: node.id,
            label: node.label,
            properties: {
              name: node.name,
              filePath: node.filePath,
              startLine: node.startLine,
              endLine: node.endLine,
              language: node.language,
            },
          });
        }

        // Query relationships
        const relsResult = await conn.query(
          "MATCH (a)-[r:CodeRelationship]->(b) RETURN a.id, r.relType, b.id"
        );
        const relationships: GraphRelationship[] = [];
        while (relsResult.hasNext()) {
          const row = await relsResult.getNext();
          relationships.push({
            id: `${row[0]}_${row[2]}`,
            type: row[1],
            source: row[0],
            target: row[2],
            properties: {},
          });
        }

        return { nodes, relationships };
      } catch (error) {
        console.error(`Failed to load graph: ${error}`);
        return null;
      }
    }
  }

  /**
   * Get all analysis history
   */
  async getAllHistory(): Promise<AnalysisHistoryEntry[]> {
    await this.initialize();
    return Array.from(this.metadata.values());
  }

  /**
   * Get history for a specific repository
   */
  async getRepoHistory(
    owner: string,
    repo: string
  ): Promise<AnalysisHistoryEntry | null> {
    await this.initialize();
    return this.metadata.get(`${owner}/${repo}`) || null;
  }

  /**
   * Delete a graph
   */
  async deleteGraph(
    owner: string,
    repo: string,
    commitSha: string
  ): Promise<boolean> {
    await this.initialize();

    const repoFullName = `${owner}/${repo}`;
    const historyEntry = this.metadata.get(repoFullName);

    if (!historyEntry) {
      return false;
    }

    const graphIndex = historyEntry.commits.findIndex(
      (c) => c.commitSha === commitSha
    );
    if (graphIndex < 0) {
      return false;
    }

    const graphMeta = historyEntry.commits[graphIndex];

    // Delete the graph files
    try {
      await fs.rm(graphMeta.dbPath, { recursive: true, force: true });
    } catch (error) {
      console.error(`Failed to delete graph files: ${error}`);
    }

    // Remove from metadata
    historyEntry.commits.splice(graphIndex, 1);
    historyEntry.lastUpdated = new Date().toISOString();

    if (historyEntry.commits.length === 0) {
      this.metadata.delete(repoFullName);
    } else {
      this.metadata.set(repoFullName, historyEntry);
    }

    await this.saveMetadata();
    return true;
  }

  /**
   * Compare two commits
   */
  async compareCommits(
    owner: string,
    repo: string,
    commitSha1: string,
    commitSha2: string
  ): Promise<{
    nodesAdded: GraphNode[];
    nodesRemoved: GraphNode[];
    relationshipsAdded: GraphRelationship[];
    relationshipsRemoved: GraphRelationship[];
  } | null> {
    const graph1 = await this.loadGraph(owner, repo, commitSha1);
    const graph2 = await this.loadGraph(owner, repo, commitSha2);

    if (!graph1 || !graph2) {
      return null;
    }

    const nodeIds1 = new Set(graph1.nodes.map((n) => n.id));
    const nodeIds2 = new Set(graph2.nodes.map((n) => n.id));

    const relIds1 = new Set(
      graph1.relationships.map((r) => `${r.source}_${r.type}_${r.target}`)
    );
    const relIds2 = new Set(
      graph2.relationships.map((r) => `${r.source}_${r.type}_${r.target}`)
    );

    return {
      nodesAdded: graph2.nodes.filter((n) => !nodeIds1.has(n.id)),
      nodesRemoved: graph1.nodes.filter((n) => !nodeIds2.has(n.id)),
      relationshipsAdded: graph2.relationships.filter(
        (r) => !relIds1.has(`${r.source}_${r.type}_${r.target}`)
      ),
      relationshipsRemoved: graph1.relationships.filter(
        (r) => !relIds2.has(`${r.source}_${r.type}_${r.target}`)
      ),
    };
  }
}

export const graphStorageService = GraphStorageService.getInstance();
