/**
 * Dual-Write Knowledge Graph Implementation
 * 
 * This class implements transparent dual-write functionality, writing data to both
 * JSON (SimpleKnowledgeGraph) and KuzuDB simultaneously. The JSON storage remains
 * the primary source of truth, while KuzuDB provides enhanced query capabilities.
 * 
 * Supports batch mode for optimized bulk writes.
 */

import type { KnowledgeGraph, GraphNode, GraphRelationship } from './types.ts';
import { SimpleKnowledgeGraph } from './graph.ts';
import type { KuzuKnowledgeGraph } from './kuzu-knowledge-graph.ts';

interface BatchBuffer {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
}

export class DualWriteKnowledgeGraph implements KnowledgeGraph {
  private jsonGraph: SimpleKnowledgeGraph;
  private kuzuGraph: KuzuKnowledgeGraph | null;
  private enableKuzuDB: boolean;
  private dualWriteStats: {
    nodesWrittenToJSON: number;
    nodesWrittenToKuzuDB: number;
    relationshipsWrittenToJSON: number;
    relationshipsWrittenToKuzuDB: number;
    kuzuErrors: number;
  };

  // Batch mode state
  private batchMode: boolean = false;
  private batchBuffer: BatchBuffer = { nodes: [], relationships: [] };
  private batchSize: number = 500;
  private autoFlushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(kuzuGraph?: KuzuKnowledgeGraph, options?: { batchSize?: number }) {
    this.jsonGraph = new SimpleKnowledgeGraph();
    this.kuzuGraph = kuzuGraph || null;
    this.enableKuzuDB = !!kuzuGraph;
    this.batchSize = options?.batchSize || 500;
    this.dualWriteStats = {
      nodesWrittenToJSON: 0,
      nodesWrittenToKuzuDB: 0,
      relationshipsWrittenToJSON: 0,
      relationshipsWrittenToKuzuDB: 0,
      kuzuErrors: 0
    };
  }

  /**
   * Get all nodes in the graph (from JSON primary storage)
   */
  get nodes(): GraphNode[] {
    return this.jsonGraph.nodes;
  }

  /**
   * Get all relationships in the graph (from JSON primary storage)
   */
  get relationships(): GraphRelationship[] {
    return this.jsonGraph.relationships;
  }

  /**
   * Begin batch mode - buffer writes for bulk commit
   */
  beginBatch(): void {
    this.batchMode = true;
    this.batchBuffer = { nodes: [], relationships: [] };
    console.log('🔄 Batch mode enabled');
  }

  /**
   * Commit batch - flush all buffered writes
   */
  async commitBatch(): Promise<void> {
    if (!this.batchMode) {
      console.warn('⚠️ commitBatch called but not in batch mode');
      return;
    }

    const nodeCount = this.batchBuffer.nodes.length;
    const relCount = this.batchBuffer.relationships.length;
    
    console.log(`🚀 Committing batch: ${nodeCount} nodes, ${relCount} relationships`);

    // Write all buffered nodes to KuzuDB
    if (this.enableKuzuDB && this.kuzuGraph && nodeCount > 0) {
      try {
        for (const node of this.batchBuffer.nodes) {
          this.kuzuGraph.addNode(node);
          this.dualWriteStats.nodesWrittenToKuzuDB++;
        }
      } catch (error) {
        this.dualWriteStats.kuzuErrors++;
        console.error('❌ KuzuDB batch node write failed:', error);
      }
    }

    // Write all buffered relationships to KuzuDB
    if (this.enableKuzuDB && this.kuzuGraph && relCount > 0) {
      try {
        for (const rel of this.batchBuffer.relationships) {
          this.kuzuGraph.addRelationship(rel);
          this.dualWriteStats.relationshipsWrittenToKuzuDB++;
        }
      } catch (error) {
        this.dualWriteStats.kuzuErrors++;
        console.error('❌ KuzuDB batch relationship write failed:', error);
      }
    }

    // Commit KuzuDB transaction
    if (this.enableKuzuDB && this.kuzuGraph) {
      try {
        await this.kuzuGraph.commitAll();
      } catch (error) {
        console.error('❌ KuzuDB commit failed:', error);
      }
    }

    // Clear buffer and exit batch mode
    this.batchBuffer = { nodes: [], relationships: [] };
    this.batchMode = false;
    
    console.log(`✅ Batch committed: ${nodeCount} nodes, ${relCount} relationships`);
  }

  /**
   * Check if in batch mode
   */
  isInBatchMode(): boolean {
    return this.batchMode;
  }

  /**
   * Get current batch buffer size
   */
  getBatchBufferSize(): { nodes: number; relationships: number } {
    return {
      nodes: this.batchBuffer.nodes.length,
      relationships: this.batchBuffer.relationships.length,
    };
  }

  /**
   * Add node - transparent dual-write
   * In batch mode, buffers KuzuDB writes for bulk commit
   */
  addNode(node: GraphNode): void {
    // Always write to JSON first (primary storage)
    this.jsonGraph.addNode(node);
    this.dualWriteStats.nodesWrittenToJSON++;

    // In batch mode, buffer for later
    if (this.batchMode) {
      this.batchBuffer.nodes.push(node);
      this.scheduleAutoFlush();
      return;
    }

    // Write to KuzuDB immediately if not in batch mode
    if (this.enableKuzuDB && this.kuzuGraph) {
      try {
        this.kuzuGraph.addNode(node);
        this.dualWriteStats.nodesWrittenToKuzuDB++;
      } catch (error) {
        this.dualWriteStats.kuzuErrors++;
        console.warn(`❌ KuzuDB node write failed for ${node.id} (${node.label}):`, error);
      }
    }
  }

  /**
   * Add relationship - transparent dual-write  
   * In batch mode, buffers KuzuDB writes for bulk commit
   */
  addRelationship(relationship: GraphRelationship): void {
    // Always write to JSON first (primary storage)
    this.jsonGraph.addRelationship(relationship);
    this.dualWriteStats.relationshipsWrittenToJSON++;

    // In batch mode, buffer for later
    if (this.batchMode) {
      this.batchBuffer.relationships.push(relationship);
      this.scheduleAutoFlush();
      return;
    }

    // Write to KuzuDB immediately if not in batch mode
    if (this.enableKuzuDB && this.kuzuGraph) {
      try {
        this.kuzuGraph.addRelationship(relationship);
        this.dualWriteStats.relationshipsWrittenToKuzuDB++;
      } catch (error) {
        this.dualWriteStats.kuzuErrors++;
        console.warn(`❌ KuzuDB relationship write failed for ${relationship.id} (${relationship.type}):`, error);
      }
    }
  }

  /**
   * Schedule auto-flush when batch buffer gets large
   */
  private scheduleAutoFlush(): void {
    const totalBuffered = this.batchBuffer.nodes.length + this.batchBuffer.relationships.length;
    
    // Auto-flush if buffer exceeds batch size
    if (totalBuffered >= this.batchSize) {
      this.flushBatchBuffer();
    }
  }

  /**
   * Flush batch buffer to KuzuDB without exiting batch mode
   */
  private async flushBatchBuffer(): Promise<void> {
    if (!this.enableKuzuDB || !this.kuzuGraph) return;
    
    const nodesToFlush = [...this.batchBuffer.nodes];
    const relsToFlush = [...this.batchBuffer.relationships];
    
    // Clear buffer
    this.batchBuffer.nodes = [];
    this.batchBuffer.relationships = [];
    
    if (nodesToFlush.length === 0 && relsToFlush.length === 0) return;

    console.log(`🔄 Auto-flushing batch: ${nodesToFlush.length} nodes, ${relsToFlush.length} relationships`);

    try {
      for (const node of nodesToFlush) {
        this.kuzuGraph.addNode(node);
        this.dualWriteStats.nodesWrittenToKuzuDB++;
      }
      
      for (const rel of relsToFlush) {
        this.kuzuGraph.addRelationship(rel);
        this.dualWriteStats.relationshipsWrittenToKuzuDB++;
      }
    } catch (error) {
      this.dualWriteStats.kuzuErrors++;
      console.error('❌ Auto-flush failed:', error);
    }
  }

  /**
   * Get KuzuDB instance for advanced operations (optional)
   */
  getKuzuGraph(): KuzuKnowledgeGraph | null {
    return this.kuzuGraph;
  }

  /**
   * Check if KuzuDB is enabled and available
   */
  isKuzuDBEnabled(): boolean {
    return this.enableKuzuDB && this.kuzuGraph !== null;
  }

  /**
   * Get dual-write statistics
   */
  getDualWriteStats() {
    return { ...this.dualWriteStats };
  }

  /**
   * Log dual-write statistics
   */
  logDualWriteStats(): void {
    console.log('📊 Dual-Write Statistics:');
    console.log(`  JSON nodes written: ${this.dualWriteStats.nodesWrittenToJSON}`);
    console.log(`  JSON relationships written: ${this.dualWriteStats.relationshipsWrittenToJSON}`);
    console.log(`  Total JSON entities: ${this.dualWriteStats.nodesWrittenToJSON + this.dualWriteStats.relationshipsWrittenToJSON}`);
    
    // Compare with actual graph counts
    const actualNodes = this.jsonGraph.nodes.length;
    const actualRels = this.jsonGraph.relationships.length;
    console.log(`  Actual JSON graph: ${actualNodes} nodes, ${actualRels} relationships`);
    
    if (actualNodes !== this.dualWriteStats.nodesWrittenToJSON) {
      console.warn(`  ⚠️ Mismatch: Expected ${this.dualWriteStats.nodesWrittenToJSON} nodes, but graph has ${actualNodes}`);
    }
    if (actualRels !== this.dualWriteStats.relationshipsWrittenToJSON) {
      console.warn(`  ⚠️ Mismatch: Expected ${this.dualWriteStats.relationshipsWrittenToJSON} relationships, but graph has ${actualRels}`);
    }
    
    if (this.enableKuzuDB) {
      console.log(`  KuzuDB nodes written: ${this.dualWriteStats.nodesWrittenToKuzuDB}`);
      console.log(`  KuzuDB relationships written: ${this.dualWriteStats.relationshipsWrittenToKuzuDB}`);
      console.log(`  KuzuDB errors: ${this.dualWriteStats.kuzuErrors}`);
      
      const totalWrites = this.dualWriteStats.nodesWrittenToJSON + this.dualWriteStats.relationshipsWrittenToJSON;
      const kuzuWrites = this.dualWriteStats.nodesWrittenToKuzuDB + this.dualWriteStats.relationshipsWrittenToKuzuDB;
      const successRate = totalWrites > 0 ? (kuzuWrites / totalWrites * 100).toFixed(1) : '0';
      console.log(`  KuzuDB success rate: ${successRate}%`);
      
      if (this.dualWriteStats.kuzuErrors > 0) {
        console.log(`  ⚠️ ${this.dualWriteStats.kuzuErrors} KuzuDB write failures detected - check logs above for details`);
      }
    } else {
      console.log('  KuzuDB: Disabled');
    }
  }

  /**
   * Flush any pending KuzuDB operations (for cleanup)
   */
  async flushKuzuDB(): Promise<void> {
    if (this.enableKuzuDB && this.kuzuGraph) {
      try {
        await this.kuzuGraph.commitAll();
        console.log('✅ KuzuDB operations flushed successfully');
        
        // Verify KuzuDB has data by running test queries
        await this.verifyKuzuDBData();
      } catch (error) {
        console.error('❌ Failed to flush KuzuDB operations:', error);
        this.dualWriteStats.kuzuErrors++;
      }
    }
  }

  /**
   * Verify KuzuDB contains expected data by running test queries
   */
  private async verifyKuzuDBData(): Promise<void> {
    if (!this.kuzuGraph || !('executeQuery' in this.kuzuGraph)) {
      console.log('⚠️ Cannot verify KuzuDB data - no query interface available');
      return;
    }

    try {
      console.log('🔍 Verifying KuzuDB data...');
      
      // Test query 1: Count all nodes
      const nodeCountResult = await (this.kuzuGraph as any).executeQuery('MATCH (n) RETURN COUNT(n) as nodeCount');
      const nodeCount = nodeCountResult.rows?.[0]?.[0] || 0;
      console.log(`📊 KuzuDB Verification - Total nodes: ${nodeCount}`);

      // Test query 2: Count all relationships  
      const relCountResult = await (this.kuzuGraph as any).executeQuery('MATCH ()-[r]->() RETURN COUNT(r) as relCount');
      const relCount = relCountResult.rows?.[0]?.[0] || 0;
      console.log(`📊 KuzuDB Verification - Total relationships: ${relCount}`);

      // Test query 3: Count nodes by type (KuzuDB-compatible)
      // Query each node table separately since KuzuDB doesn't have labels() function
      // Check if polymorphic nodes are enabled
      const { isPolymorphicNodesEnabled } = await import('../../config/features.ts');
      
      if (isPolymorphicNodesEnabled()) {
        // Polymorphic approach: Query by elementType
        console.log('📊 KuzuDB Verification - Node types (polymorphic):');
        const nodeTypes = ['Function', 'Class', 'Method', 'File', 'Variable', 'Interface', 'Type', 'Import', 'Project', 'Folder'];
        
        for (const nodeType of nodeTypes) {
          try {
            const result = await (this.kuzuGraph as any).executeQuery(`MATCH (n:CodeElement {elementType: '${nodeType}'}) RETURN COUNT(n) as count`);
            const count = result.rows?.[0]?.[0] || 0;
            if (count > 0) {
              console.log(`  ${nodeType}: ${count} nodes`);
            }
          } catch {
            // Skip silently
          }
        }
      } else {
        // Traditional approach: Query individual tables
        console.log('📊 KuzuDB Verification - Node types:');
        const nodeTypes = ['Function', 'Class', 'Method', 'File', 'Variable', 'Interface', 'Type', 'Import', 'Project', 'Folder'];
        
        for (const nodeType of nodeTypes) {
          try {
            const result = await (this.kuzuGraph as any).executeQuery(`MATCH (n:${nodeType}) RETURN COUNT(n) as count`);
            const count = result.rows?.[0]?.[0] || 0;
            if (count > 0) {
              console.log(`  ${nodeType}: ${count} nodes`);
            }
          } catch {
            // Node type might not exist in this database, skip silently
          }
        }
      }

      // Test query 4: Count relationships by type (KuzuDB-compatible)
      // Query each relationship table separately since KuzuDB doesn't have type() function
      const relTypes = ['CONTAINS', 'CALLS', 'INHERITS', 'IMPLEMENTS', 'OVERRIDES', 'IMPORTS', 'DEFINES', 'BELONGS_TO', 'USES', 'ACCESSES', 'EXTENDS'];
      
      if (isPolymorphicNodesEnabled()) {
        // Polymorphic approach: Query by relationshipType
        console.log('📊 KuzuDB Verification - Relationship types (polymorphic):');
        
        for (const relType of relTypes) {
          try {
            const result = await (this.kuzuGraph as any).executeQuery(`MATCH ()-[r:CodeRelationship {relationshipType: '${relType}'}]->() RETURN COUNT(r) as count`);
            const count = result.rows?.[0]?.[0] || 0;
            if (count > 0) {
              console.log(`  ${relType}: ${count} relationships`);
            }
          } catch {
            // Skip silently
          }
        }
      } else {
        // Traditional approach: Query individual tables
        console.log('📊 KuzuDB Verification - Relationship types:');
        
        for (const relType of relTypes) {
          try {
            const result = await (this.kuzuGraph as any).executeQuery(`MATCH ()-[r:${relType}]->() RETURN COUNT(r) as count`);
            const count = result.rows?.[0]?.[0] || 0;
            if (count > 0) {
              console.log(`  ${relType}: ${count} relationships`);
            }
          } catch {
            // Relationship type might not exist in this database, skip silently
          }
        }
      }

      // Test query 5: Sample some actual data
      const sampleQuery = isPolymorphicNodesEnabled() 
        ? `MATCH (f:CodeElement {elementType: 'Function'}) RETURN f.name, f.filePath, f.startLine LIMIT 5`
        : `MATCH (f:Function) RETURN f.name, f.filePath, f.startLine LIMIT 5`;
      
      const sampleResult = await (this.kuzuGraph as any).executeQuery(sampleQuery);
      
      if (sampleResult.rows && sampleResult.rows.length > 0) {
        console.log('📊 KuzuDB Verification - Sample functions:');
        sampleResult.rows.forEach((row: any) => {
          console.log(`  ${row[0]} (${row[1]}:${row[2]})`);
        });
      }

      console.log('✅ KuzuDB verification completed successfully');
      
    } catch (error) {
      console.error('❌ KuzuDB verification failed:', error);
      console.error('❌ This indicates the data may not be properly stored in KuzuDB');
    }
  }
}

