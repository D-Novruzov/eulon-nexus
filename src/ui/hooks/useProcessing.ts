import { useState, useCallback } from "react";
import {
  IngestionService,
  type IngestionResult,
} from "../../services/ingestion.service";

interface ProcessingState {
  isProcessing: boolean;
  progress: string;
  error: string;
  result: IngestionResult | null;
}

interface UseProcessingReturn {
  state: ProcessingState;
  processGitHubRepo: (url: string, token?: string) => Promise<void>;
  processZipFile: (file: File) => Promise<void>;
  clearError: () => void;
  clearResult: () => void;
}

/**
 * Custom hook for managing processing operations
 */
export const useProcessing = (): UseProcessingReturn => {
  const [state, setState] = useState<ProcessingState>({
    isProcessing: false,
    progress: "",
    error: "",
    result: null,
  });

  const updateState = useCallback((updates: Partial<ProcessingState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  const processGitHubRepo = useCallback(
    async (url: string, token?: string) => {
      try {
        updateState({
          isProcessing: true,
          progress: "Starting GitHub repository processing...",
          error: "",
          result: null,
        });

        console.log("🚀 useProcessing: Starting GitHub processing for:", url);

        // Get GitHub access token from backend session or use provided token
        let githubToken = token;

        if (!githubToken) {
          // Try to get token from backend session
          const sessionToken = localStorage.getItem("github_session_token");

          if (sessionToken) {
            console.log(
              "📝 Found session token in localStorage, fetching GitHub access token from backend..."
            );
            try {
              const API_BASE_URL =
                import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
              const response = await fetch(
                `${API_BASE_URL}/integrations/github/me`,
                {
                  credentials: "include",
                  headers: {
                    "X-Session-Token": sessionToken,
                  },
                }
              );

              if (response.ok) {
                const data = await response.json();
                githubToken = data.accessToken;
                console.log(
                  `✅ Retrieved GitHub access token from backend session (${githubToken?.substring(
                    0,
                    8
                  )}...)`
                );
              } else {
                console.error(
                  "❌ Failed to fetch GitHub token from backend:",
                  response.status,
                  response.statusText
                );
              }
            } catch (err) {
              console.error(
                "❌ Error retrieving GitHub token from backend:",
                err
              );
            }
          } else {
            console.warn(
              "⚠️ No session token found in localStorage - will use unauthenticated GitHub API (60 requests/hour)"
            );
          }
        } else {
          console.log("✅ Using provided GitHub token");
        }

        if (!githubToken) {
          console.warn(
            "⚠️⚠️⚠️ IMPORTANT: No GitHub token available! API calls will be UNAUTHENTICATED (60 requests/hour limit)"
          );
        }

        // Create ingestion service with token
        const ingestionService = new IngestionService(githubToken);

        const result = await ingestionService.processGitHubRepo(url, {
          onProgress: (message: string) => {
            updateState({ progress: message });
          },
        });

        updateState({
          isProcessing: false,
          progress: "",
          result,
        });
        console.log(
          "✅ useProcessing: GitHub processing completed successfully"
        );
      } catch (error) {
        // Enhanced error message for rate limiting
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";

        // Check if it's a rate limit error and provide helpful context
        if (errorMessage.includes("rate limit")) {
          console.error("❌ GitHub API Rate Limit Hit:", error);
        } else {
          console.error("❌ useProcessing: GitHub processing error:", error);
        }

        updateState({
          isProcessing: false,
          progress: "",
          error: errorMessage,
        });
      }
    },
    [updateState]
  );

  const processZipFile = useCallback(
    async (file: File) => {
      try {
        updateState({
          isProcessing: true,
          progress: "Starting ZIP file processing...",
          error: "",
          result: null,
        });

        console.log(
          "🚀 useProcessing: Starting ZIP processing for:",
          file.name
        );

        // Create ingestion service (no token needed for ZIP files)
        const ingestionService = new IngestionService();

        const result = await ingestionService.processZipFile(file, {
          onProgress: (message: string) => {
            updateState({ progress: message });
          },
        });

        updateState({
          isProcessing: false,
          progress: "",
          result,
        });
        console.log("✅ useProcessing: ZIP processing completed successfully");
      } catch (error) {
        updateState({
          isProcessing: false,
          progress: "",
          error:
            error instanceof Error ? error.message : "Unknown error occurred",
        });
        console.error("❌ useProcessing: ZIP processing error:", error);
      }
    },
    [updateState]
  );

  const clearError = useCallback(() => {
    updateState({ error: "" });
  }, [updateState]);

  const clearResult = useCallback(() => {
    updateState({ result: null });
  }, [updateState]);

  return {
    state,
    processGitHubRepo,
    processZipFile,
    clearError,
    clearResult,
  };
};
