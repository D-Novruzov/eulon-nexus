/**
 * Worker Pool Initialization and Cleanup Setup
 * 
 * This module sets up global cleanup handlers to prevent memory leaks
 * from worker pools when the application shuts down or becomes inactive.
 */

import { WebWorkerPoolUtils } from './web-worker-pool.js';

/**
 * Initialize worker pool cleanup handlers
 * Call this once when your application starts
 */
export function initializeWorkerPoolCleanup(): void {
  console.log('Initializing worker pool cleanup handlers...');
  
  // Memory monitoring is now handled by MemoryManager and individual processors
  console.log('💾 Memory monitoring delegated to MemoryManager');
  
  console.log('Worker pool cleanup handlers initialized');
}

/**
 * Manual cleanup function - call this when you want to force cleanup
 */
export async function cleanupWorkerPools(): Promise<void> {
  console.log('Manual worker pool cleanup triggered...');
  await WebWorkerPoolUtils.cleanupAllPools();
  console.log('Worker pool cleanup complete');
}

/**
 * Get current memory usage information
 */
export function getMemoryInfo(): { usedMB: number; totalMB: number; percentage: number } | null {
  if (typeof performance !== 'undefined' && performance.memory) {
    const memInfo = performance.memory;
    const usedMB = memInfo.usedJSHeapSize / (1024 * 1024);
    const totalMB = memInfo.totalJSHeapSize / (1024 * 1024);
    const percentage = (usedMB / totalMB) * 100;
    
    return {
      usedMB: Math.round(usedMB * 100) / 100,
      totalMB: Math.round(totalMB * 100) / 100,
      percentage: Math.round(percentage * 100) / 100
    };
  }
  
  return null;
}
