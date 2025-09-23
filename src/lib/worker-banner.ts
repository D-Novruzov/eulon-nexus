/**
 * Worker Banner - Display worker configuration at startup
 */

import type { GitNexusConfig } from '../../gitnexus.config.ts';

/**
 * Display a startup banner with worker configuration
 */
export function displayWorkerBanner(config: GitNexusConfig, workerCount: number): void {
  const workerConfig = config.processing.workers;
  
  console.log('');
  console.log('🚀 GitNexus Worker Configuration');
  console.log('='.repeat(60));
  console.log(`Mode: ${workerConfig.mode.toUpperCase()}`);
  
  if (workerConfig.mode === 'auto') {
    console.log('Auto Configuration:');
    console.log(`  • Max Workers: ${workerConfig.auto.maxWorkers}`);
    console.log(`  • CPU Multiplier: ${workerConfig.auto.cpuMultiplier}`);
    console.log(`  • Memory per Worker: ${workerConfig.auto.memoryPerWorkerMB}MB`);
  } else {
    console.log('Manual Configuration:');
    console.log(`  • Fixed Worker Count: ${workerConfig.manual.count}`);
  }
  
  console.log('');
  console.log(`✨ Active Workers: ${workerCount}`);
  console.log(`⏱️ Worker Timeout: ${config.processing.parallel.workerTimeoutMs / 1000}s`);
  console.log(`📦 Batch Size: ${config.processing.parallel.batchSize}`);
  console.log('='.repeat(60));
  console.log('');
}

/**
 * Display environment variable overrides available
 */
export function displayWorkerEnvHelp(): void {
  console.log('💡 Environment Variable Overrides:');
  console.log('  VITE_WORKER_MODE=auto|manual');
  console.log('  VITE_WORKER_MAX_WORKERS=16');
  console.log('  VITE_WORKER_MANUAL_COUNT=4');
  console.log('  VITE_WORKER_CPU_MULTIPLIER=0.75');
  console.log('  VITE_WORKER_MEMORY_PER_WORKER_MB=60');
  console.log('');
}
