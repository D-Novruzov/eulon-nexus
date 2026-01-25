# Graph Persistence System

## Overview

Persists the knowledge graph to IndexedDB so it survives page reloads. No re-analysis needed for previously analyzed repositories.

---

## Storage

| Storage | What's Stored |
|---------|---------------|
| **IndexedDB** | Graph nodes, relationships, file hashes |
| **localStorage** | Last opened repo ID |

---

## Repo ID Format

- **GitHub:** `github:owner/repo` or `github:owner/repo@commitSha`
- **ZIP:** `zip:filename.zip:fileSize`

---

## Flows

### 1. Page Load (Auto-Restore)

```
Page opens
    ↓
Check localStorage for "gitnexus_last_repo"
    ↓
Found? → Load graph from IndexedDB → Display instantly
Not found? → Show welcome screen
```

### 2. Analyze New Repository

```
User enters repo URL
    ↓
Generate repoId from URL
    ↓
Download repository files
    ↓
Hash all files (SHA-256)
    ↓
Run 4-pass ingestion pipeline
    ↓
Save to IndexedDB: { repoId, nodes, relationships, fileHashes }
    ↓
Save to localStorage: lastRepoId
```

### 3. Re-Analyze Same Repository

```
User enters same repo URL
    ↓
Generate repoId
    ↓
Check IndexedDB for cached graph
    ↓
Found? → Download files → Hash files → Compare hashes
    ↓
No changes? → Load from cache (instant)
Changes detected? → Re-run pipeline → Update cache
```

---

## File Hashing

**Purpose:** Detect which files changed without comparing full content.

- Uses SHA-256 via Web Crypto API
- Each file → 64-character unique fingerprint
- Same content = Same hash (always)

**Change Detection:**
- **Added:** File in current, not in stored
- **Modified:** Different hash for same path
- **Deleted:** File in stored, not in current
- **Unchanged:** Same hash = skip re-parsing

---

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/graph-persistence.ts` | IndexedDB operations |
| `src/lib/content-hasher.ts` | SHA-256 file hashing |
| `src/ui/hooks/useLocalGraphPersistence.ts` | React hook for auto-restore |
| `src/services/ingestion.service.ts` | Cache check before pipeline |

---

## Benefits

- **Instant reload:** No re-analysis on page refresh
- **Smart caching:** Only re-analyze changed files
- **Offline support:** Graph available without network
- **Multi-repo:** Each repo cached separately

