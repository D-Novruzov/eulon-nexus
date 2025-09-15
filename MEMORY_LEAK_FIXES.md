# Memory Leak Fixes for Worker Pool Parallel Processing

## Issues Identified and Fixed

### 1. **Event Listener Memory Leaks** ✅ FIXED
**Problem**: WebWorkerPool wasn't properly cleaning up event listeners during shutdown, causing memory leaks.

**Fix Applied**:
- Added proper event listener cleanup in `shutdown()` method
- Set `worker.onmessage = null`, `worker.onerror = null`, `worker.onmessageerror = null` before terminating workers
- Clear the `eventListeners` Map during shutdown

**Files Modified**: `src/lib/web-worker-pool.ts`

### 2. **Singleton Worker Pool Issues** ✅ FIXED  
**Problem**: FileProcessingPool singleton instances were never cleaned up, accumulating memory over time.

**Fix Applied**:
- Added `shutdownInstance()` static method to properly cleanup singleton instances
- Added `hasInstance()` method to check if instance exists
- Added `cleanupAllPools()` utility method in WebWorkerPoolUtils

**Files Modified**: `src/lib/web-worker-pool.ts`

### 3. **Worker Error Handling** ✅ FIXED
**Problem**: Errors in worker termination could leave resources hanging.

**Fix Applied**:
- Improved `handleWorkerError()` method to properly cleanup worker event listeners
- Added try-catch around worker termination
- Ensure workers are removed from pools even on errors

**Files Modified**: `src/lib/web-worker-pool.ts`

### 4. **Missing Memory Monitoring** ✅ FIXED
**Problem**: No memory usage tracking or automatic cleanup triggers.

**Fix Applied**:
- Added `monitorMemoryUsage()` method with automatic cleanup triggers
- Added memory usage estimation in `getStats()` method
- Created periodic memory monitoring in ParallelParsingProcessor
- Added global cleanup handlers for page unload and visibility changes

**Files Modified**: `src/lib/web-worker-pool.ts`, `src/core/ingestion/parallel-parsing-processor.ts`

### 5. **AST Map Accumulation** ✅ FIXED
**Problem**: Large AST maps and function tries were kept in memory without limits.

**Fix Applied**:
- Added `MAX_AST_MAP_SIZE` constant (1000 entries)
- Implemented `cleanupASTMap()` method to remove old entries when limit is exceeded
- Added proper cleanup of AST maps, processed files, and function tries in shutdown
- Added Tree-sitter parser cleanup with `parser.delete()`

**Files Modified**: `src/core/ingestion/parallel-parsing-processor.ts`

### 6. **Pipeline Cleanup Issues** ✅ FIXED
**Problem**: Parallel pipeline wasn't ensuring proper cleanup on errors.

**Fix Applied**:
- Enhanced cleanup method to call `WebWorkerPoolUtils.cleanupAllPools()`
- Added cleanup in both error and finally blocks
- Ensured cleanup happens even when errors occur

**Files Modified**: `src/core/ingestion/parallel-pipeline.ts`

## New Features Added

### Memory Monitoring System
- **Automatic Memory Monitoring**: Checks memory usage every 30 seconds
- **Threshold-based Cleanup**: Triggers cleanup when memory usage exceeds 500MB
- **AST Map Size Limiting**: Automatically cleans up old AST entries when limit exceeded
- **Global Memory Monitoring**: Monitors overall browser memory usage

### Global Cleanup Handlers
- **Page Unload Cleanup**: Automatically cleans up when user closes/refreshes page
- **Tab Visibility Cleanup**: Cleans up when user switches tabs (page becomes hidden)
- **Manual Cleanup Functions**: Utilities for forcing cleanup when needed

### Enhanced Error Handling
- **Graceful Worker Termination**: Proper cleanup even when workers fail
- **Resource Leak Prevention**: Ensures all event listeners and references are cleared
- **Error Recovery**: System continues working even if some workers fail

## Usage Instructions

### 1. Initialize Cleanup Handlers (RECOMMENDED)
```typescript
import { initializeWorkerPoolCleanup } from './src/lib/worker-pool-init.js';

// Call this once when your app starts
initializeWorkerPoolCleanup();
```

### 2. Manual Cleanup (if needed)
```typescript
import { cleanupWorkerPools } from './src/lib/worker-pool-init.js';

// Force cleanup when needed
await cleanupWorkerPools();
```

### 3. Monitor Memory Usage
```typescript
import { getMemoryInfo } from './src/lib/worker-pool-init.js';

const memInfo = getMemoryInfo();
if (memInfo) {
  console.log(`Memory: ${memInfo.usedMB}MB / ${memInfo.totalMB}MB (${memInfo.percentage}%)`);
}
```

## Performance Improvements

### Before Fixes:
- Worker pools accumulated without cleanup
- Event listeners remained attached after worker termination
- AST maps grew unbounded causing memory bloat
- No automatic memory management

### After Fixes:
- **Automatic Resource Cleanup**: All resources properly cleaned up
- **Memory Usage Monitoring**: Real-time monitoring with automatic cleanup triggers
- **Bounded Memory Growth**: AST maps and other data structures have size limits
- **Graceful Shutdown**: Proper cleanup on app/tab close

## Monitoring and Debugging

The system now provides detailed logging for:
- Memory usage statistics
- Worker pool status
- Cleanup operations
- Error conditions

Check browser console for messages like:
```
ParallelParsingProcessor Memory Stats:
- Memory Manager: 245.67MB used, 150 files cached
- AST Map: 750 entries
- Processed Files: 890 entries

Memory usage: 245.67MB / 512.00MB (47.98%)
```

## Files Created/Modified

### Modified Files:
- `src/lib/web-worker-pool.ts` - Enhanced with memory leak fixes
- `src/core/ingestion/parallel-parsing-processor.ts` - Added memory monitoring and cleanup
- `src/core/ingestion/parallel-pipeline.ts` - Enhanced cleanup handling

### New Files:
- `src/lib/worker-pool-init.ts` - Initialization and utility functions
- `MEMORY_LEAK_FIXES.md` - This documentation

## Testing Recommendations

1. **Monitor Memory Usage**: Watch browser's Task Manager during large codebase processing
2. **Test Tab Switching**: Switch tabs during processing to verify cleanup triggers
3. **Test Page Refresh**: Refresh page during processing to ensure proper cleanup
4. **Long-running Tests**: Process multiple large codebases to verify no memory accumulation

The system should now maintain stable memory usage even during intensive parallel processing operations.
