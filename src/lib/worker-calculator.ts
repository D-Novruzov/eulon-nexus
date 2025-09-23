/**
 * Simple Worker Calculator
 * 
 * Calculates optimal worker count based on hardware and configuration
 * without complex categorization or unused pool types.
 */

import type { GitNexusConfig } from '../../gitnexus.config.ts';

interface PerformanceMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface PerformanceWithMemory extends Performance {
  memory?: PerformanceMemory;
}

interface SystemInfo {
  cpuCores: number;
  availableMemoryMB?: number;
}

interface WorkerCalculationResult {
  workerCount: number;
  reasoning: string;
  limitations: string[];
}

/**
 * Get system hardware information
 */
function getSystemInfo(): SystemInfo {
  const cpuCores = navigator.hardwareConcurrency || 4;
  
  let availableMemoryMB: number | undefined;
  if (typeof performance !== 'undefined' && (performance as PerformanceWithMemory).memory) {
    // Use 75% of available heap as safe limit
    availableMemoryMB = Math.floor(((performance as PerformanceWithMemory).memory!.jsHeapSizeLimit * 0.75) / (1024 * 1024));
  }
  
  return { cpuCores, availableMemoryMB };
}

/**
 * Calculate optimal worker count based on configuration and hardware
 */
export async function calculateWorkerCount(config: GitNexusConfig): Promise<WorkerCalculationResult> {
  const systemInfo = getSystemInfo();
  const workerConfig = config.processing.workers;
  const limitations: string[] = [];
  
  let workerCount: number;
  let reasoning: string;
  
  // Log system information
  console.log('🖥️ System Information:');
  console.log(`   CPU cores: ${systemInfo.cpuCores}`);
  if (systemInfo.availableMemoryMB) {
    console.log(`   Available memory: ${systemInfo.availableMemoryMB}MB`);
  } else {
    console.log('   Available memory: Unknown (performance.memory not available)');
  }
  
  if (workerConfig.mode === 'manual') {
    workerCount = workerConfig.manual.count;
    reasoning = `Manual mode: ${workerCount} workers configured`;
    
    console.log('🎛️ Worker Mode: MANUAL');
    console.log(`   Configured workers: ${workerCount}`);
  } else {
    // Auto mode calculation
    const { cpuCores, availableMemoryMB } = systemInfo;
    const { maxWorkers, memoryPerWorkerMB, cpuMultiplier } = workerConfig.auto;
    
    console.log('🤖 Worker Mode: AUTO');
    console.log(`   CPU multiplier: ${cpuMultiplier}`);
    console.log(`   Memory per worker: ${memoryPerWorkerMB}MB`);
    console.log(`   Max workers limit: ${maxWorkers}`);
    
    // CPU-based calculation
    const cpuBasedWorkers = Math.floor(cpuCores * cpuMultiplier);
    limitations.push(`CPU: ${cpuBasedWorkers} (${cpuCores} cores × ${cpuMultiplier})`);
    
    // Memory-based calculation (if available)
    let memoryBasedWorkers = maxWorkers;
    if (availableMemoryMB) {
      memoryBasedWorkers = Math.floor(availableMemoryMB / memoryPerWorkerMB);
      limitations.push(`Memory: ${memoryBasedWorkers} (${availableMemoryMB}MB ÷ ${memoryPerWorkerMB}MB per worker)`);
    } else {
      limitations.push(`Memory: Unknown (using max limit: ${maxWorkers})`);
    }
    
    // Take the minimum of all constraints
    workerCount = Math.min(cpuBasedWorkers, memoryBasedWorkers, maxWorkers);
    limitations.push(`Config max: ${maxWorkers}`);
    
    // Safety minimum
    workerCount = Math.max(1, workerCount);
    
    reasoning = `Auto mode: min(${limitations.join(', ')}) = ${workerCount}`;
    
    console.log('   Calculation breakdown:');
    limitations.forEach(limitation => console.log(`     ${limitation}`));
  }
  
  console.log(`🚀 Final Result: ${workerCount} workers enabled`);
  console.log(`   Reasoning: ${reasoning}`);
  
  // Display configuration banner
  const { displayWorkerBanner } = await import('./worker-banner.ts');
  displayWorkerBanner(config, workerCount);
  
  return {
    workerCount,
    reasoning,
    limitations
  };
}

/**
 * Get current system information for debugging
 */
export function getSystemInfoForDebug() {
  const systemInfo = getSystemInfo();
  return {
    ...systemInfo,
    memoryInfo: (performance as PerformanceWithMemory).memory ? {
      usedMB: Math.round((performance as PerformanceWithMemory).memory!.usedJSHeapSize / (1024 * 1024)),
      totalMB: Math.round((performance as PerformanceWithMemory).memory!.totalJSHeapSize / (1024 * 1024)),
      limitMB: Math.round((performance as PerformanceWithMemory).memory!.jsHeapSizeLimit / (1024 * 1024))
    } : null
  };
}
