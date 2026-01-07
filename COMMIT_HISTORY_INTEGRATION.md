# Commit History Feature Integration Guide

This document explains how to integrate the new commit history tracking feature into GitNexus to show users how the project changed after each commit.

## Overview

The commit history feature consists of:

1. **Types** (`src/core/graph/commit-history.types.ts`): TypeScript interfaces for commit data
2. **Service** (`src/services/commit-history.service.ts`): GitHub API integration for fetching commits
3. **Components** (`src/ui/components/`): React components to display timeline and statistics
4. **Hook** (`src/ui/hooks/useCommitHistory.ts`): React hook for state management

## Quick Integration

### Step 1: Add to HomePage State

Extend `HomePage.tsx` to include commit history in the app state:

```typescript
interface AppState {
  // ... existing state ...
  commitTimeline: CommitTimeline | null;
  showCommitHistory: boolean;
}

const initialState: AppState = {
  // ... existing state ...
  commitTimeline: null,
  showCommitHistory: false,
};
```

### Step 2: Use the Hook

In `HomePage.tsx`, initialize the commit history hook:

```typescript
import { useCommitHistory } from "../hooks/useCommitHistory.ts";

export const HomePage: React.FC = () => {
  const {
    timeline,
    isLoading: historyLoading,
    error: historyError,
    fetchCommitHistory,
  } = useCommitHistory(getGitHubAccessToken());

  // ... rest of component ...
};
```

### Step 3: Fetch History When Repository is Loaded

After a repository is loaded successfully, fetch its commit history:

```typescript
// After graph ingestion completes
const [owner, repo] = extractOwnerRepoFromUrl(githubUrl);
if (owner && repo) {
  try {
    const timeline = await fetchCommitHistory(owner, repo, {
      maxCommits: 100,
      includeDiffs: false, // Set to true to fetch detailed diffs (slower, more API calls)
    });
    setState((prev) => ({
      ...prev,
      commitTimeline: timeline,
    }));
  } catch (error) {
    console.warn("Failed to load commit history:", error);
  }
}
```

### Step 4: Render Components

Add the commit history components to your UI:

```typescript
import {
  CommitHistoryViewer,
  ProjectEvolutionStats,
} from "../components/index.ts";

// In your render JSX:
{
  state.commitTimeline && (
    <div
      style={{
        marginTop: "20px",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "20px",
      }}
    >
      <CommitHistoryViewer
        timeline={state.commitTimeline}
        isLoading={historyLoading}
        onCommitSelect={(commit) => {
          console.log("Selected commit:", commit);
          // Optional: Can implement detailed commit view here
        }}
      />
      <ProjectEvolutionStats timeline={state.commitTimeline} />
    </div>
  );
}
```

## API Reference

### CommitHistoryService

#### Constructor

```typescript
const service = new CommitHistoryService(githubToken?: string);
```

#### Methods

**`fetchCommitHistory(owner, repo, options?)`**

- Returns: `Promise<CommitInfo[]>`
- Fetches commit history (up to maxCommits)
- Options: `{ maxCommits?: number }`

**`fetchCommitDiff(owner, repo, sha)`**

- Returns: `Promise<CommitDiff>`
- Fetches detailed diff information for a specific commit

**`buildCommitTimeline(owner, repo, options?)`**

- Returns: `Promise<CommitTimeline>`
- Comprehensive timeline with statistics
- Options: `{ maxCommits?: number, includeDiffs?: boolean }`

**`groupCommitsByDate(commits)`**

- Returns: `Map<string, CommitInfo[]>`
- Groups commits by date (YYYY-MM-DD)

**`groupCommitsByAuthor(commits)`**

- Returns: `Map<string, CommitInfo[]>`
- Groups commits by author name

**`getAuthors(commits)`**

- Returns: `Set<string>`
- Get unique author names

### useCommitHistory Hook

```typescript
const {
  timeline,           // Current timeline data or null
  isLoading,         // Loading state
  error,             // Error message or null
  fetchCommitHistory, // Function to fetch history
  clearHistory,      // Clear the timeline
  clearCache,        // Clear internal cache
} = useCommitHistory(githubToken?: string);
```

## Components

### CommitHistoryViewer

Interactive timeline showing individual commits:

```typescript
<CommitHistoryViewer
  timeline={timeline}
  onCommitSelect={(commit) => console.log(commit)}
  isLoading={false}
/>
```

Features:

- Chronological timeline visualization
- Commit selection and details
- Filter by author
- Links to GitHub commit pages
- Full commit message display

### ProjectEvolutionStats

Statistics about project evolution:

```typescript
<ProjectEvolutionStats timeline={timeline} />
```

Features:

- Total commits and contributor count
- Top contributors with percentages
- Monthly activity chart
- Code change statistics
- Project date range

## Example Integration in HomePage

```typescript
const HomePage: React.FC = () => {
  const [state, setState] = useState<AppState>(initialState);
  const { timeline, isLoading, error, fetchCommitHistory } = useCommitHistory(
    getGitHubAccessToken()
  );

  const handleRepositoryLoaded = useCallback(async () => {
    const [owner, repo] = extractOwnerRepo(state.githubUrl);
    if (owner && repo) {
      try {
        const historyTimeline = await fetchCommitHistory(owner, repo, {
          maxCommits: 100,
        });
        setState((prev) => ({
          ...prev,
          commitTimeline: historyTimeline,
          showCommitHistory: true,
        }));
      } catch (err) {
        console.error("Failed to fetch commit history:", err);
      }
    }
  }, [state.githubUrl, fetchCommitHistory]);

  return (
    <div>
      {/* Existing graph visualization */}
      <GraphExplorer graph={state.graph} />

      {/* New commit history section */}
      {state.showCommitHistory && state.commitTimeline && (
        <div style={{ marginTop: "40px" }}>
          <h2>Repository Evolution</h2>
          <ProjectEvolutionStats timeline={state.commitTimeline} />
          <CommitHistoryViewer
            timeline={state.commitTimeline}
            isLoading={isLoading}
          />
        </div>
      )}
    </div>
  );
};
```

## Performance Considerations

1. **Rate Limiting**: GitHub API has rate limits (60/hour unauthenticated, 5000/hour authenticated)

   - Default fetches last 100 commits
   - Diff fetching is optional and batched with concurrency limit

2. **Caching**: The service caches results by repository URL

   - Clear with `clearCache()` if needed

3. **Partial Loading**:
   - Basic commit history loads quickly
   - Detailed diffs can be expensive (1 API call per commit)
   - Set `includeDiffs: false` for faster loading

## Error Handling

All methods throw errors that should be caught:

```typescript
try {
  const timeline = await fetchCommitHistory("owner", "repo");
  setState((prev) => ({ ...prev, commitTimeline: timeline }));
} catch (error) {
  // Handle: rate limit, 404, authentication, network errors
  console.error("Failed to load history:", error.message);
}
```

Common errors:

- `"Repository or resource not found"` (404)
- `"GitHub API rate limit exceeded"` (403)
- `"GitHub API authentication failed"` (401)
- Network timeout errors

## Data Structure

### CommitTimeline

```typescript
{
  commits: CommitInfo[],    // Array of commits
  stats: CommitHistoryStats, // Aggregated statistics
  snapshots: ProjectSnapshot[] // Code snapshots at each commit (future)
}
```

### CommitInfo

```typescript
{
  sha: string; // Commit hash
  message: string; // Commit message
  author: {
    name, email, date;
  }
  committer: {
    name, email, date;
  }
  url: string; // API URL
  htmlUrl: string; // GitHub URL
  timestamp: number; // Unix timestamp
}
```

### CommitHistoryStats

```typescript
{
  totalCommits: number;
  dateRange: {
    earliest, latest;
  } // Unix timestamps
  filesChanged: Set<string>;
  totalAdditions: number;
  totalDeletions: number;
  averageChangesPerCommit: number;
}
```

## Future Enhancements

1. **Project Snapshots**: Analyze codebase at each commit to show:

   - File count changes
   - Line count trends
   - Language distribution evolution

2. **Detailed Commit View**: Show:

   - File-by-file changes
   - Diff visualization
   - Related issues/PRs

3. **Timeline Visualization**: More advanced charts

   - Contribution heatmap
   - Commit trend analysis
   - Merge vs regular commit ratio

4. **Correlation Analysis**:
   - Link commit changes to graph changes
   - Show impact of commits on code structure
