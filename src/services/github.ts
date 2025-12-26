import axios, { type AxiosInstance, type AxiosResponse } from "axios";
import { ignoreService } from "../config/ignore-service.js";

interface GitHubFile {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  git_url: string;
  download_url: string | null;
  type: "file" | "dir";
  content?: string;
  encoding?: string;
}

interface GitHubDirectory {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  git_url: string;
  download_url: string | null;
  type: "file" | "dir";
}

interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  used: number;
}

interface GitHubError {
  message: string;
  documentation_url?: string;
}

export interface CompleteRepositoryStructure {
  allPaths: string[]; // All file and directory paths
  fileContents: Map<string, string>; // Only files with content
}

export class GitHubService {
  private client: AxiosInstance;
  private baseURL = "https://api.github.com";
  private rateLimitInfo: RateLimitInfo | null = null;

  constructor(token?: string) {
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        Accept: "application/vnd.github.v3+json",
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      timeout: 30000,
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        this.updateRateLimitInfo(response);
        return response;
      },
      (error: { response?: AxiosResponse; message: string }) => {
        if (error.response) {
          this.updateRateLimitInfo(error.response);

          if (error.response.status === 403 && this.isRateLimited()) {
            const resetTime = new Date(this.rateLimitInfo!.reset * 1000);
            throw new Error(
              `GitHub API rate limit exceeded. Resets at ${resetTime.toISOString()}`
            );
          }

          if (error.response.status === 401) {
            throw new Error(
              "GitHub API authentication failed. Please check your token."
            );
          }

          if (error.response.status === 404) {
            throw new Error("Repository or resource not found.");
          }

          const githubError: GitHubError = error.response.data;
          throw new Error(`GitHub API error: ${githubError.message}`);
        }

        throw new Error(`Network error: ${error.message}`);
      }
    );
  }

  private updateRateLimitInfo(response: AxiosResponse): void {
    const headers = response.headers;
    if (headers["x-ratelimit-limit"]) {
      this.rateLimitInfo = {
        limit: parseInt(headers["x-ratelimit-limit"], 10),
        remaining: parseInt(headers["x-ratelimit-remaining"], 10),
        reset: parseInt(headers["x-ratelimit-reset"], 10),
        used: parseInt(headers["x-ratelimit-used"], 10),
      };
    }
  }

  private isRateLimited(): boolean {
    return this.rateLimitInfo !== null && this.rateLimitInfo.remaining === 0;
  }

  public getRateLimitInfo(): RateLimitInfo | null {
    return this.rateLimitInfo;
  }

  public async checkRateLimit(): Promise<void> {
    if (this.isRateLimited()) {
      const resetTime = new Date(this.rateLimitInfo!.reset * 1000);
      const now = new Date();

      if (now < resetTime) {
        const waitTime = Math.ceil(
          (resetTime.getTime() - now.getTime()) / 1000
        );
        throw new Error(
          `Rate limit exceeded. Wait ${waitTime} seconds before making another request.`
        );
      }
    }
  }

  public async getRepositoryContents(
    owner: string,
    repo: string,
    path: string = ""
  ): Promise<(GitHubFile | GitHubDirectory)[]> {
    await this.checkRateLimit();

    try {
      const response = await this.client.get(
        `/repos/${owner}/${repo}/contents/${path}`
      );

      if (!Array.isArray(response.data)) {
        throw new Error(
          "Expected directory contents, but received a single file."
        );
      }

      return response.data as (GitHubFile | GitHubDirectory)[];
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error("Failed to fetch repository contents");
    }
  }

  public async getFileContent(
    owner: string,
    repo: string,
    path: string
  ): Promise<string> {
    await this.checkRateLimit();

    try {
      const response = await this.client.get(
        `/repos/${owner}/${repo}/contents/${path}`
      );
      const file = response.data as GitHubFile;

      if (file.type !== "file") {
        throw new Error(`Path ${path} is not a file`);
      }

      // If content or encoding is missing, try to download directly
      if (!file.content || !file.encoding) {
        if (file.download_url) {
          console.warn(
            `File ${path} missing content/encoding, downloading directly`
          );
          return await this.downloadFileRaw(owner, repo, path);
        } else {
          throw new Error(
            "File content, encoding, and download URL are all missing"
          );
        }
      }

      if (file.encoding === "base64") {
        try {
          return atob(file.content.replace(/\s/g, ""));
        } catch {
          throw new Error("Failed to decode base64 content");
        }
      }

      return file.content;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error("Failed to fetch file content");
    }
  }

  public async downloadFileRaw(
    owner: string,
    repo: string,
    path: string
  ): Promise<string> {
    await this.checkRateLimit();

    try {
      const response = await this.client.get(
        `/repos/${owner}/${repo}/contents/${path}`
      );
      const file = response.data as GitHubFile;

      if (file.type !== "file" || !file.download_url) {
        throw new Error(`Cannot download file: ${path}`);
      }

      const downloadResponse = await axios.get(file.download_url, {
        timeout: 30000,
      });

      return downloadResponse.data;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error("Failed to download file");
    }
  }

  public async getAllFilesRecursively(
    owner: string,
    repo: string,
    path: string = ""
  ): Promise<GitHubFile[]> {
    const files: GitHubFile[] = [];

    try {
      const contents = await this.getRepositoryContents(owner, repo, path);

      for (const item of contents) {
        if (item.type === "dir") {
          // Skip common directories that shouldn't be processed
          if (this.shouldSkipDirectory(item.path)) {
            console.log(`Skipping directory: ${item.path}`);
            continue;
          }

          // Recursively get files from subdirectories
          const subFiles = await this.getAllFilesRecursively(
            owner,
            repo,
            item.path
          );
          files.push(...subFiles);
        } else if (item.type === "file") {
          // Only include files that should be processed
          if (this.shouldIncludeFile(item.path)) {
            files.push(item);
          } else {
            console.log(`Skipping file: ${item.path}`);
          }
        }
      }
    } catch (error) {
      console.error(`Error fetching contents for ${path}:`, error);
    }

    return files;
  }

  private shouldSkipDirectory(path: string): boolean {
    if (!path) return true; // Skip if path is undefined/null
    return ignoreService.shouldIgnoreDirectory(path);
  }

  private shouldIncludeFile(path: string): boolean {
    if (!path) return false; // Skip if path is undefined/null
    return !ignoreService.shouldIgnorePath(path);
  }

  // Removed unused method shouldSkipFileForContent since early pruning now avoids fetching ignored files

  public async getAllPathsRecursively(
    owner: string,
    repo: string,
    path: string = ""
  ): Promise<string[]> {
    const allPaths: string[] = [];
    const fileContents: Map<string, string> = new Map();

    try {
      const contents = await this.getRepositoryContents(owner, repo, path);

      for (const item of contents) {
        const fullPath = item.path;
        allPaths.push(fullPath);

        if (item.type === "file" && this.shouldIncludeFile(fullPath)) {
          const content = await this.getFileContent(owner, repo, fullPath);
          fileContents.set(fullPath, content);
        }

        if (item.type === "dir") {
          // Skip common directories that shouldn't be processed
          if (this.shouldSkipDirectory(fullPath)) {
            console.log(`Skipping directory: ${fullPath}`);
            continue;
          }
          const subPaths = await this.getAllPathsRecursively(
            owner,
            repo,
            fullPath
          );
          allPaths.push(...subPaths);
        }
      }
    } catch (error) {
      console.error(`Error fetching contents for ${path}:`, error);
    }

    return allPaths;
  }

  /**
   * Get complete repository structure including all paths and file contents
   * This is the new robust method that discovers structure first, then filters during parsing
   */
  public async getCompleteRepositoryStructure(
    owner: string,
    repo: string
  ): Promise<CompleteRepositoryStructure> {
    // Ensure ignore patterns are initialized before traversal so we can prune early
    try {
      await ignoreService.initialize();
    } catch (e) {
      console.warn(
        "GitHubService: IgnoreService initialization failed, proceeding with defaults",
        e
      );
    }

    const allPaths: string[] = [];
    const fileContents: Map<string, string> = new Map();

    try {
      await this.collectPathsAndContent(
        owner,
        repo,
        "",
        allPaths,
        fileContents
      );

      console.log(
        `GitHub: Extracted ${allPaths.length} paths, ${fileContents.size} files`
      );

      // Validate we got some files
      if (allPaths.length === 0) {
        throw new Error(
          `No files found in repository ${owner}/${repo}. This could be due to:\n` +
            `1. Rate limiting (GitHub allows 60 requests/hour without authentication, 5000/hour with)\n` +
            `2. Repository is empty\n` +
            `3. Repository is private and requires authentication\n` +
            `4. All files are being filtered by ignore patterns\n\n` +
            `Try authenticating with GitHub to increase rate limits.`
        );
      }

      return {
        allPaths,
        fileContents,
      };
    } catch (error) {
      // Re-throw with enhanced context
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to fetch repository structure: ${String(error)}`);
    }
  }

  private async collectPathsAndContent(
    owner: string,
    repo: string,
    path: string,
    allPaths: string[],
    fileContents: Map<string, string>
  ): Promise<void> {
    try {
      const contents = await this.getRepositoryContents(owner, repo, path);

      for (const item of contents) {
        const fullPath = item.path;

        if (item.type === "dir") {
          // Early prune ignored directories (e.g., .venv, node_modules, .git)
          if (this.shouldSkipDirectory(fullPath)) {
            // console.log(`Pruned directory: ${fullPath}`);
            continue;
          }

          // Track visible directory and recurse
          allPaths.push(fullPath);
          await this.collectPathsAndContent(
            owner,
            repo,
            fullPath,
            allPaths,
            fileContents
          );
          continue;
        }

        if (item.type === "file") {
          // Only include files that are not ignored
          if (this.shouldIncludeFile(fullPath)) {
            allPaths.push(fullPath);
            try {
              const content = await this.getFileContent(owner, repo, fullPath);
              fileContents.set(fullPath, content);
            } catch (error) {
              console.warn(`Failed to get content for ${fullPath}:`, error);
            }
          } else {
            // Skipped ignored file
            // console.log(`Pruned file: ${fullPath}`);
          }
        }
      }
    } catch (error) {
      // Enhanced error handling with specific messages
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 403) {
          const rateLimitReset = error.response.headers["x-ratelimit-reset"];
          const resetTime = rateLimitReset
            ? new Date(parseInt(rateLimitReset) * 1000).toLocaleTimeString()
            : "unknown";
          throw new Error(
            `GitHub API rate limit exceeded. Resets at ${resetTime}. Please authenticate with a GitHub token for higher rate limits (5000/hour vs 60/hour).`
          );
        } else if (error.response?.status === 401) {
          throw new Error(
            "GitHub authentication failed. Please check your access token."
          );
        } else if (error.response?.status === 404) {
          throw new Error(
            `Repository path not found: ${owner}/${repo}/${path}. Please check the repository exists and is accessible.`
          );
        }
      }
      console.error(`Error fetching contents for ${path}:`, error);
      throw error;
    }
  }

  public getAuthenticationStatus(): {
    authenticated: boolean;
    rateLimitInfo: RateLimitInfo | null;
  } {
    const authHeader = this.client.defaults.headers["Authorization"];
    return {
      authenticated: !!authHeader,
      rateLimitInfo: this.rateLimitInfo,
    };
  }
}
