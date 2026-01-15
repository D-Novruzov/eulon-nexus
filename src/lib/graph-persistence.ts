/**
 * Graph Persistence Layer
 * Stores knowledge graphs in IndexedDB for instant reload
 */

import type { GraphNode, GraphRelationship } from '../core/graph/types';
import type { SerializedFunctionRegistry } from '../core/graph/trie';

export interface PersistedGraph {
  repoId: string;
  nodes: GraphNode[];
  relationships: GraphRelationship[];
  fileHashes: Record<string, string>;
  createdAt: number;
  projectName?: string;
  sourceType?: 'github' | 'zip';
  commitSha?: string;
  functionRegistry?: SerializedFunctionRegistry;
}

// IndexedDB stores: 'graphs' (PersistedGraph), 'metadata' (key-value pairs)

const DB_NAME = 'gitnexus-graphs';
const DB_VERSION = 1;
const GRAPHS_STORE = 'graphs';
const METADATA_STORE = 'metadata';

class GraphPersistenceService {
  private db: IDBDatabase | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;

  /**
   * Initialize IndexedDB connection
   */
  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('❌ IndexedDB open failed:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('✅ IndexedDB connected');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create graphs store with repoId as key
        if (!db.objectStoreNames.contains(GRAPHS_STORE)) {
          const graphStore = db.createObjectStore(GRAPHS_STORE, { keyPath: 'repoId' });
          graphStore.createIndex('createdAt', 'createdAt', { unique: false });
          console.log('📦 Created graphs store');
        }

        // Create metadata store for misc data
        if (!db.objectStoreNames.contains(METADATA_STORE)) {
          db.createObjectStore(METADATA_STORE, { keyPath: 'key' });
          console.log('📦 Created metadata store');
        }
      };
    });

    return this.dbPromise;
  }

  /**
   * Generate a unique repo ID from source info
   */
  generateRepoId(source: {
    type: 'github';
    owner: string;
    repo: string;
    commitSha?: string;
  } | {
    type: 'zip';
    filename: string;
    size: number;
  }): string {
    if (source.type === 'github') {
      const base = `github:${source.owner}/${source.repo}`;
      return source.commitSha ? `${base}@${source.commitSha.substring(0, 7)}` : base;
    }
    return `zip:${source.filename}:${source.size}`;
  }

  /**
   * Save a graph to IndexedDB
   */
  async save(graph: PersistedGraph): Promise<void> {
    const db = await this.getDB();
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(GRAPHS_STORE, 'readwrite');
      const store = tx.objectStore(GRAPHS_STORE);

      const request = store.put(graph);

      request.onerror = () => {
        console.error('❌ Failed to save graph:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        console.log(`✅ Saved graph ${graph.repoId}: ${graph.nodes.length} nodes, ${graph.relationships.length} relationships`);
        resolve();
      };

      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Load a graph from IndexedDB
   */
  async load(repoId: string): Promise<PersistedGraph | null> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(GRAPHS_STORE, 'readonly');
      const store = tx.objectStore(GRAPHS_STORE);

      const request = store.get(repoId);

      request.onerror = () => {
        console.error('❌ Failed to load graph:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        const result = request.result as PersistedGraph | undefined;
        if (result) {
          console.log(`✅ Loaded graph ${repoId}: ${result.nodes.length} nodes, ${result.relationships.length} relationships`);
        } else {
          console.log(`ℹ️ No cached graph found for ${repoId}`);
        }
        resolve(result || null);
      };
    });
  }

  /**
   * Check if a graph exists in IndexedDB
   */
  async exists(repoId: string): Promise<boolean> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(GRAPHS_STORE, 'readonly');
      const store = tx.objectStore(GRAPHS_STORE);

      const request = store.getKey(repoId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result !== undefined);
    });
  }

  /**
   * Delete a graph from IndexedDB
   */
  async clear(repoId: string): Promise<void> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(GRAPHS_STORE, 'readwrite');
      const store = tx.objectStore(GRAPHS_STORE);

      const request = store.delete(repoId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        console.log(`✅ Cleared graph ${repoId}`);
        resolve();
      };
    });
  }

  /**
   * Get all stored repository IDs
   */
  async getAllRepoIds(): Promise<string[]> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(GRAPHS_STORE, 'readonly');
      const store = tx.objectStore(GRAPHS_STORE);

      const request = store.getAllKeys();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as string[]);
    });
  }

  /**
   * Get all stored graphs metadata (without full node/relationship data)
   */
  async getAllMetadata(): Promise<Array<{
    repoId: string;
    projectName?: string;
    nodeCount: number;
    relationshipCount: number;
    createdAt: number;
  }>> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(GRAPHS_STORE, 'readonly');
      const store = tx.objectStore(GRAPHS_STORE);

      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const results = (request.result as PersistedGraph[]).map(g => ({
          repoId: g.repoId,
          projectName: g.projectName,
          nodeCount: g.nodes.length,
          relationshipCount: g.relationships.length,
          createdAt: g.createdAt,
        }));
        resolve(results);
      };
    });
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    totalGraphs: number;
    totalNodes: number;
    totalRelationships: number;
  }> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(GRAPHS_STORE, 'readonly');
      const store = tx.objectStore(GRAPHS_STORE);

      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const graphs = request.result as PersistedGraph[];
        resolve({
          totalGraphs: graphs.length,
          totalNodes: graphs.reduce((sum, g) => sum + g.nodes.length, 0),
          totalRelationships: graphs.reduce((sum, g) => sum + g.relationships.length, 0),
        });
      };
    });
  }

  /**
   * Clear all stored graphs
   */
  async clearAll(): Promise<void> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(GRAPHS_STORE, 'readwrite');
      const store = tx.objectStore(GRAPHS_STORE);

      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        console.log('✅ Cleared all graphs');
        resolve();
      };
    });
  }

  /**
   * Save metadata value
   */
  async setMetadata(key: string, value: any): Promise<void> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(METADATA_STORE, 'readwrite');
      const store = tx.objectStore(METADATA_STORE);

      const request = store.put({ key, value });

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Get metadata value
   */
  async getMetadata<T>(key: string): Promise<T | null> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(METADATA_STORE, 'readonly');
      const store = tx.objectStore(METADATA_STORE);

      const request = store.get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        resolve(request.result?.value ?? null);
      };
    });
  }
}

// Export singleton instance and interface
export const GraphPersistence = new GraphPersistenceService();

// Also export the class for testing
export { GraphPersistenceService };

