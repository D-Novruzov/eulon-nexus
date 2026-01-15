/**
 * Fast content hashing for incremental file processing
 * Uses Web Crypto API for SHA-256 hashing
 */

export class ContentHasher {
  private static encoder = new TextEncoder();

  /**
   * Generate SHA-256 hash of content using Web Crypto API
   */
  static async hashContent(content: string): Promise<string> {
    const data = this.encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Generate hashes for multiple files in parallel
   */
  static async hashFiles(fileContents: Map<string, string>): Promise<Record<string, string>> {
    const entries = Array.from(fileContents.entries());
    
    // Process in batches of 50 to avoid overwhelming the browser
    const batchSize = 50;
    const results: Record<string, string> = {};

    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      const hashPromises = batch.map(async ([path, content]) => {
        const hash = await this.hashContent(content);
        return { path, hash };
      });

      const batchResults = await Promise.all(hashPromises);
      batchResults.forEach(({ path, hash }) => {
        results[path] = hash;
      });
    }

    return results;
  }

  /**
   * Compare current file hashes with stored hashes
   * Returns lists of changed files
   */
  static compareHashes(
    currentHashes: Record<string, string>,
    storedHashes: Record<string, string>
  ): {
    added: string[];
    modified: string[];
    deleted: string[];
    unchanged: string[];
  } {
    const added: string[] = [];
    const modified: string[] = [];
    const deleted: string[] = [];
    const unchanged: string[] = [];

    // Find added and modified files
    for (const [path, hash] of Object.entries(currentHashes)) {
      const storedHash = storedHashes[path];
      if (!storedHash) {
        added.push(path);
      } else if (storedHash !== hash) {
        modified.push(path);
      } else {
        unchanged.push(path);
      }
    }

    // Find deleted files
    for (const path of Object.keys(storedHashes)) {
      if (!(path in currentHashes)) {
        deleted.push(path);
      }
    }

    return { added, modified, deleted, unchanged };
  }

  /**
   * Check if any files have changed
   */
  static hasChanges(
    currentHashes: Record<string, string>,
    storedHashes: Record<string, string>
  ): boolean {
    const { added, modified, deleted } = this.compareHashes(currentHashes, storedHashes);
    return added.length > 0 || modified.length > 0 || deleted.length > 0;
  }

  /**
   * Quick check if file counts differ (fast pre-check)
   */
  static fileCountsDiffer(
    currentHashes: Record<string, string>,
    storedHashes: Record<string, string>
  ): boolean {
    return Object.keys(currentHashes).length !== Object.keys(storedHashes).length;
  }
}

