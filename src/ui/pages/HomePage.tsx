// @ts-nocheck
import React, { useState, useCallback, useEffect } from "react";
import ErrorBoundary from "../components/ErrorBoundary.tsx";
import { GraphExplorer } from "../components/graph/index.ts";
import { ChatInterface } from "../components/chat/index.ts";
import WarningDialog from "../components/WarningDialog.tsx";
import ExportFormatModal from "../components/ExportFormatModal.tsx";
import RepositoryInput from "../components/repository/RepositoryInput.tsx";
import LoadingIndicator from "../components/LoadingIndicator.tsx";
import type { KnowledgeGraph } from "../../core/graph/types.ts";
import { IngestionService } from "../../services/ingestion.service.ts";
import { LLMService, type LLMProvider } from "../../ai/llm-service.ts";
import {
  exportAndDownloadGraph,
  exportAndDownloadGraphAsCSV,
} from "../../lib/export.ts";
import type { ExportFormat } from "../components/ExportFormatModal.tsx";
import { useSettings } from "../hooks/useSettings.ts";
import GitHubConnectCard from "../components/github/GitHubConnectCard.tsx";
import GitHubRepoPicker from "../components/github/GitHubRepoPicker.tsx";
import {
  CommitHistoryViewer,
  ProjectEvolutionStats,
} from "../components/index.ts";
import { useCommitHistory } from "../hooks/useCommitHistory.ts";
import { useGraphPersistence } from "../hooks/useGraphPersistence.ts";
import { useLocalGraphPersistence } from "../hooks/useLocalGraphPersistence.ts";

interface AppState {
  // Data
  graph: KnowledgeGraph | null;
  fileContents: Map<string, string>;

  // UI State
  selectedNodeId: string | null;
  showWelcome: boolean;
  isLoading: boolean;
  showStats: boolean;
  showExportModal: boolean;
  showHistory: boolean;

  // Input State
  directoryFilter: string;
  fileExtensions: string;
  githubUrl: string;
  githubToken: string;

  // Processing State
  isProcessing: boolean;
  progress: string;
  error: string;

  // Settings managed separately via useSettings hook
  showSettings: boolean;
}

const initialState: AppState = {
  graph: null,
  fileContents: new Map(),
  selectedNodeId: null,
  showWelcome: true,
  isLoading: false,
  showStats: false,
  showExportModal: false,
  showHistory: false,
  directoryFilter: "src,lib,components,pages,utils",
  fileExtensions:
    ".ts,.tsx,.js,.jsx,.py,.java,.cpp,.c,.cs,.php,.rb,.go,.rs,.swift,.kt,.scala,.clj,.hs,.ml,.fs,.elm,.dart,.lua,.r,.m,.sh,.sql,.html,.css,.scss,.less,.vue,.svelte",
  githubUrl: "",
  githubToken: localStorage.getItem("github_token") || "",
  isProcessing: false,
  progress: "",
  error: "",
  showSettings: false,
};

const HomePage: React.FC = () => {
  const [state, setState] = useState<AppState>(initialState);
  const [showNewProjectWarning, setShowNewProjectWarning] = useState(false);
  const [isGitHubConnected, setIsGitHubConnected] = useState(false);
  const [showGitHubRepoPicker, setShowGitHubRepoPicker] = useState(false);
  const [githubImportMessage, setGitHubImportMessage] = useState<string | null>(
    null,
  );
  // Create LLM service once (doesn't need token updates)
  const [llmService] = useState(() => new LLMService());

  // Helper to get current GitHub access token from session or localStorage
  const getGitHubAccessToken = useCallback(() => {
    // Try to get from session storage (set after OAuth - this is the actual access token)
    const accessToken = sessionStorage.getItem("github_access_token");
    if (accessToken) {
      return accessToken;
    }
    // Fall back to localStorage (legacy)
    const legacyToken = localStorage.getItem("github_session_token");
    if (legacyToken) {
      return legacyToken;
    }
    // Fall back to state
    return state.githubToken || undefined;
  }, [state.githubToken]);

  // Commit history hook (uses current GitHub token if available)
  const githubToken = getGitHubAccessToken();
  const {
    timeline: commitTimeline,
    isLoading: historyLoading,
    error: historyError,
    fetchCommitHistory,
  } = useCommitHistory(githubToken);

  // Graph persistence hook for storing graphs on the server
  const {
    storeGraph,
    loadGraph,
    fetchAllHistory,
    fetchRepoHistory,
    history: graphHistory,
    currentRepoHistory,
    isLoading: persistenceLoading,
    isSaving: persistenceSaving,
    error: persistenceError,
  } = useGraphPersistence();

  // Track which commits have graphs stored & current loading state
  const [analyzedCommits, setAnalyzedCommits] = useState<Set<string>>(
    new Set(),
  );
  const [loadingCommitSha, setLoadingCommitSha] = useState<string | null>(null);
  const [currentRepoInfo, setCurrentRepoInfo] = useState<{
    owner: string;
    repo: string;
  } | null>(null);
  const [currentCommitSha, setCurrentCommitSha] = useState<string | null>(null); // Track which commit's graph is currently displayed
  const [isGraphFullScreen, setIsGraphFullScreen] = useState(false);

  // Enhanced progress tracking
  const [loadingStage, setLoadingStage] = useState<string>("");
  const [loadingProgress, setLoadingProgress] = useState<number | undefined>(
    undefined,
  );

  // Use settings hook for LLM configuration
  const {
    settings,
    updateSetting,
    getCurrentProviderApiKey,
    updateCurrentProviderApiKey,
  } = useSettings();

  // Local graph persistence hook (IndexedDB) for instant reload
  const { restoreLastSession, isLoading: localPersistenceLoading } =
    useLocalGraphPersistence();

  // Auto-restore last session on mount
  const [autoRestoreAttempted, setAutoRestoreAttempted] = useState(false);

  useEffect(() => {
    if (autoRestoreAttempted || localPersistenceLoading) return;

    const attemptAutoRestore = async () => {
      setAutoRestoreAttempted(true);

      try {
        const restored = await restoreLastSession();

        if (restored) {
          console.log(`✅ Auto-restored graph: ${restored.repoId}`);
          setState((prev) => ({
            ...prev,
            graph: restored.graph,
            showWelcome: false,
            progress: `Restored from cache: ${restored.projectName || restored.repoId}`,
          }));

          // Extract repo info from repoId if it's a GitHub repo
          if (restored.repoId.startsWith("github:")) {
            const match = restored.repoId.match(/^github:([^/]+)\/([^@]+)/);
            if (match) {
              setCurrentRepoInfo({ owner: match[1], repo: match[2] });
            }
          }
        }
      } catch (error) {
        console.warn("Auto-restore failed:", error);
      }
    };

    attemptAutoRestore();
  }, [localPersistenceLoading, autoRestoreAttempted, restoreLastSession]);

  const updateState = useCallback((updates: Partial<AppState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleNodeSelect = (nodeId: string | null) => {
    updateState({ selectedNodeId: nodeId });
  };

  // Save GitHub token to localStorage
  useEffect(() => {
    if (state.githubToken) {
      localStorage.setItem("github_token", state.githubToken);
    }
  }, [state.githubToken]);

  // Load graph history from server on startup
  useEffect(() => {
    fetchAllHistory().catch((err) => {
      console.warn("Failed to load graph history:", err);
    });
  }, [fetchAllHistory]);

  // Sync analyzed commits with stored graphs when repo changes
  useEffect(() => {
    if (currentRepoInfo && currentRepoHistory) {
      const storedCommitShas = new Set(
        currentRepoHistory.commits.map((c) => c.commitSha),
      );
      setAnalyzedCommits(storedCommitShas);
      console.log(
        `📊 Synced ${storedCommitShas.size} analyzed commits for ${currentRepoInfo.owner}/${currentRepoInfo.repo}`,
      );

      // Auto-load the latest commit's graph if available
      if (currentRepoHistory.commits.length > 0 && !currentCommitSha) {
        // Commits are stored newest first, so first one is latest
        const latestCommit = currentRepoHistory.commits[0];
        console.log(
          `🔄 Auto-loading latest commit graph: ${latestCommit.commitSha.substring(0, 7)}`,
        );
        loadGraph(
          currentRepoInfo.owner,
          currentRepoInfo.repo,
          latestCommit.commitSha,
        )
          .then((graph) => {
            if (graph) {
              setCurrentCommitSha(latestCommit.commitSha);
              updateState({ graph, fileContents: new Map() });
            }
          })
          .catch((err) => {
            console.warn("Failed to auto-load latest commit graph:", err);
          });
      }
    }
  }, [
    currentRepoInfo,
    currentRepoHistory,
    currentCommitSha,
    loadGraph,
    updateState,
  ]);

  // Fetch repo history when repo is selected
  useEffect(() => {
    if (currentRepoInfo) {
      fetchRepoHistory(currentRepoInfo.owner, currentRepoInfo.repo).catch(
        (err) => {
          console.warn("Failed to fetch repo history:", err);
        },
      );
    }
  }, [currentRepoInfo, fetchRepoHistory]);

  // Extract repo info from githubUrl if currentRepoInfo is not set
  useEffect(() => {
    if (!currentRepoInfo && state.githubUrl) {
      const urlMatch = state.githubUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (urlMatch) {
        const [, owner, repo] = urlMatch;
        console.log(`📦 Auto-extracting repo info from URL: ${owner}/${repo}`);
        setCurrentRepoInfo({ owner, repo });
      }
    }
  }, [state.githubUrl, currentRepoInfo]);

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file || !file.name.endsWith(".zip")) {
      updateState({ error: "Please select a valid ZIP file" });
      return;
    }

    try {
      setLoadingStage("Extracting");
      updateState({
        isProcessing: true,
        error: "",
        progress: "Reading ZIP file...",
        showWelcome: false,
      });

      console.log("Starting ZIP processing...", file.name);

      // Create ingestion service (no token needed for ZIP files)
      const ingestionService = new IngestionService();
      const result = await ingestionService.processZipFile(file, {
        directoryFilter: state.directoryFilter,
        fileExtensions: state.fileExtensions,
      });

      console.log("ZIP processing completed:", {
        nodeCount: result.graph?.nodes?.length || 0,
        relationshipCount: result.graph?.relationships?.length || 0,
        fileCount: result.fileContents?.size || 0,
      });

      setLoadingStage("");
      setLoadingProgress(undefined);
      setCurrentCommitSha(null); // ZIP files don't have commits
      updateState({
        graph: result.graph,
        fileContents: result.fileContents,
        isProcessing: false,
        progress: "",
        showWelcome: false, // Ensure we stay in main interface
      });
    } catch (error) {
      console.error("ZIP processing error:", error);
      updateState({
        error:
          error instanceof Error ? error.message : "Failed to process ZIP file",
        isProcessing: false,
        progress: "",
        showWelcome: true, // Return to welcome screen on error
      });
    }
  };

  /**
   * Import selected GitHub repositories using the existing ingestion pipeline.
   * This reuses the same graph/indexing logic; GitHub only changes how we
   * fetch repository contents (via the backend + GitHub API).
   */
  const handleGitHubReposImport = async (repos: any[]) => {
    if (!repos || repos.length === 0) return;

    try {
      setLoadingStage("Initializing");
      setLoadingProgress(0);
      updateState({
        isProcessing: true,
        error: "",
        progress: "Starting GitHub repository processing...",
        showWelcome: false,
      });

      // Get current GitHub access token
      const githubToken = getGitHubAccessToken();
      console.log(
        `🔑 Using GitHub token for repo processing: ${
          githubToken ? "YES" : "NO"
        }`,
      );

      // Create ingestion service with GitHub token for authenticated requests
      const ingestionService = new IngestionService(githubToken);

      for (const repo of repos) {
        const url = `https://github.com/${repo.owner}/${repo.name}`;

        setLoadingStage("Downloading");
        setLoadingProgress(10);
        updateState({
          githubUrl: url,
          progress: `Downloading ${repo.fullName || url}...`,
        });

        const result = await ingestionService.processGitHubRepo(url, {
          directoryFilter: state.directoryFilter,
          fileExtensions: state.fileExtensions,
          onProgress: (message: string) => {
            // Update stage based on message
            if (
              message.includes("Downloading") ||
              message.includes("archive")
            ) {
              setLoadingStage("Downloading");
              setLoadingProgress(20);
            } else if (
              message.includes("Extracting") ||
              message.includes("Discovered")
            ) {
              setLoadingStage("Extracting");
              setLoadingProgress(40);
            } else if (
              message.includes("Generating") ||
              message.includes("Parsing")
            ) {
              setLoadingStage("Analyzing");
              setLoadingProgress(60);
            } else if (
              message.includes("Resolving") ||
              message.includes("Call")
            ) {
              setLoadingStage("Building Graph");
              setLoadingProgress(80);
            }
            updateState({ progress: message });
          },
        });

        updateState({
          graph: result.graph,
          fileContents: result.fileContents,
        });

        // Fetch commit history FIRST to get commit info
        setLoadingStage("Fetching History");
        setLoadingProgress(85);
        let latestCommitSha = `import-${Date.now()}`;
        let latestCommitMessage = "Initial import";
        let latestCommitDate = new Date().toISOString();

        try {
          updateState({ progress: "Fetching commit history..." });
          const historyResult = await fetchCommitHistory(
            repo.owner,
            repo.name,
            {
              maxCommits: 100,
              includeDiffs: false,
            },
          );

          // Get latest commit info if available (first commit is newest after sort reversal)
          if (historyResult?.commits?.[0]) {
            const latestCommit = historyResult.commits[0];
            latestCommitSha = latestCommit.sha;
            latestCommitMessage = latestCommit.message;
            latestCommitDate = latestCommit.author?.date || latestCommitDate;
            // Set current commit to latest
            setCurrentCommitSha(latestCommitSha);
          }
        } catch (e) {
          console.warn("Commit history loading failed:", e);
        }

        // Store graph on the server for persistence
        try {
          setLoadingStage("Saving");
          setLoadingProgress(90);
          updateState({ progress: "Saving graph to server..." });
          console.log(
            `📤 Storing graph for ${repo.owner}/${
              repo.name
            }@${latestCommitSha.substring(0, 7)}...`,
          );

          await storeGraph(
            repo.owner,
            repo.name,
            latestCommitSha,
            latestCommitMessage,
            latestCommitDate,
            result.graph,
          );
          console.log(
            `✅ Graph stored on server for ${repo.owner}/${repo.name}`,
          );

          // Mark this commit as analyzed
          setAnalyzedCommits((prev) => new Set([...prev, latestCommitSha]));
          setCurrentRepoInfo({ owner: repo.owner, repo: repo.name });
        } catch (e) {
          console.error("❌ Graph persistence failed:", e);
        }
      }

      setLoadingStage("");
      setLoadingProgress(undefined);
      updateState({
        isProcessing: false,
        progress: "",
        showWelcome: false,
      });
      setGitHubImportMessage(
        "Repository successfully added to your knowledge graph",
      );
      setShowGitHubRepoPicker(false);
    } catch (error) {
      console.error("GitHub processing error:", error);
      setLoadingStage("");
      setLoadingProgress(undefined);
      updateState({
        error:
          error instanceof Error
            ? error.message
            : "Failed to process GitHub repositories",
        isProcessing: false,
        progress: "",
        showWelcome: true,
      });
    }
  };

  /**
   * Handle analyzing a specific commit (downloads code at that commit SHA and builds graph)
   */
  const handleAnalyzeCommit = async (commit: any) => {
    if (!currentRepoInfo) {
      console.error("No repo info available");
      return;
    }

    const { owner, repo } = currentRepoInfo;

    try {
      setLoadingCommitSha(commit.sha);
      setLoadingStage("Analyzing Commit");
      setLoadingProgress(0);
      updateState({
        progress: `Analyzing commit ${commit.sha.substring(0, 7)}...`,
      });

      // Get GitHub token for authenticated requests
      const githubToken = getGitHubAccessToken();
      const ingestionService = new IngestionService(githubToken);

      // Process the repo at this specific commit
      // Note: GitHub archive URL with ref parameter downloads that specific commit
      const url = `https://github.com/${owner}/${repo}`;

      const result = await ingestionService.processGitHubRepo(url, {
        directoryFilter: state.directoryFilter,
        fileExtensions: state.fileExtensions,
        ref: commit.sha, // Download this specific commit
        onProgress: (message: string) => {
          if (message.includes("Downloading")) {
            setLoadingStage("Downloading");
            setLoadingProgress(20);
          } else if (
            message.includes("Extracting") ||
            message.includes("Discovered")
          ) {
            setLoadingStage("Extracting");
            setLoadingProgress(40);
          } else if (
            message.includes("Generating") ||
            message.includes("Parsing")
          ) {
            setLoadingStage("Analyzing");
            setLoadingProgress(60);
          } else if (
            message.includes("Resolving") ||
            message.includes("Call")
          ) {
            setLoadingStage("Building Graph");
            setLoadingProgress(80);
          }
          updateState({ progress: message });
        },
      });

      // Store graph for this commit
      await storeGraph(
        owner,
        repo,
        commit.sha,
        commit.message,
        commit.author?.date || new Date().toISOString(),
        result.graph,
      );

      // Update state
      setLoadingStage("");
      setLoadingProgress(undefined);
      setCurrentCommitSha(commit.sha);
      updateState({
        graph: result.graph,
        fileContents: result.fileContents,
        progress: "",
      });

      // Mark as analyzed
      setAnalyzedCommits((prev) => new Set([...prev, commit.sha]));
      console.log(
        `✅ Analyzed and stored graph for commit ${commit.sha.substring(0, 7)}`,
      );
    } catch (error) {
      console.error("Failed to analyze commit:", error);
      setLoadingStage("");
      setLoadingProgress(undefined);
      updateState({
        error:
          error instanceof Error ? error.message : "Failed to analyze commit",
        progress: "",
      });
    } finally {
      setLoadingCommitSha(null);
    }
  };

  /**
   * Handle loading a previously stored graph for a commit
   */
  const handleLoadGraph = async (commit: any) => {
    if (!currentRepoInfo) {
      console.error("No repo info available");
      return;
    }

    const { owner, repo } = currentRepoInfo;

    try {
      setLoadingCommitSha(commit.sha);
      setLoadingStage("Loading Graph");
      setLoadingProgress(50);
      updateState({
        progress: `Loading graph for commit ${commit.sha.substring(0, 7)}...`,
      });

      // Update progress to show we're fetching
      setLoadingProgress(60);
      updateState({
        progress: `Fetching graph data for commit ${commit.sha.substring(0, 7)}...`,
      });

      const graph = await loadGraph(owner, repo, commit.sha);

      // Update progress to show we're processing
      setLoadingProgress(80);
      updateState({
        progress: `Processing graph data...`,
      });

      setLoadingStage("");
      setLoadingProgress(undefined);
      if (graph) {
        setCurrentCommitSha(commit.sha);
        // Since the graph comes from JSON.parse, it's already a new object reference
        // We only need to ensure the top-level reference is new, not deep clone everything
        // This avoids blocking the UI thread for large graphs
        const newGraph: KnowledgeGraph = {
          ...graph,
          nodes: [...graph.nodes],
          relationships: [...graph.relationships],
        };
        updateState({
          graph: newGraph,
          progress: "",
        });
        console.log(`✅ Loaded graph for commit ${commit.sha.substring(0, 7)}`);
      } else {
        console.warn("No graph found, may need to analyze first");
        updateState({ progress: "" });
      }
    } catch (error) {
      console.error("Failed to load graph:", error);
      setLoadingStage("");
      setLoadingProgress(undefined);
      updateState({
        error: error instanceof Error ? error.message : "Failed to load graph",
        progress: "",
      });
    } finally {
      setLoadingCommitSha(null);
    }
  };

  /**
   * Handle batch analysis of multiple commits
   */
  const handleBatchAnalyzeCommits = async (commits: any[]) => {
    if (!currentRepoInfo || commits.length === 0) {
      return;
    }

    const { owner, repo } = currentRepoInfo;
    const githubToken = getGitHubAccessToken();
    const ingestionService = new IngestionService(githubToken);

    const totalCommits = commits.length;
    let processed = 0;
    const successful: string[] = [];
    const failed: Array<{ sha: string; error: string }> = [];

    setLoadingStage("Batch Analysis");
    setLoadingProgress(0);
    updateState({
      progress: `Analyzing ${totalCommits} commits... (0/${totalCommits})`,
      isProcessing: true,
    });

    for (const commit of commits) {
      try {
        setLoadingCommitSha(commit.sha);
        setLoadingStage("Analyzing Commit");
        setLoadingProgress(Math.round((processed / totalCommits) * 100));
        updateState({
          progress: `Analyzing commit ${commit.sha.substring(0, 7)}... (${processed + 1}/${totalCommits})`,
        });

        const result = await ingestionService.processGitHubRepo(
          `https://github.com/${owner}/${repo}`,
          {
            directoryFilter: state.directoryFilter,
            fileExtensions: state.fileExtensions,
            ref: commit.sha,
            onProgress: (message: string) => {
              updateState({
                progress: `[${processed + 1}/${totalCommits}] ${message}`,
              });
            },
          },
        );

        // Store graph for this commit
        await storeGraph(
          owner,
          repo,
          commit.sha,
          commit.message,
          commit.author?.date || new Date().toISOString(),
          result.graph,
        );

        successful.push(commit.sha);
        setAnalyzedCommits((prev) => new Set([...prev, commit.sha]));
        processed++;

        console.log(
          `✅ [${processed}/${totalCommits}] Analyzed commit ${commit.sha.substring(0, 7)}`,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        failed.push({ sha: commit.sha, error: errorMessage });
        processed++;
        console.error(
          `❌ [${processed}/${totalCommits}] Failed to analyze commit ${commit.sha.substring(0, 7)}:`,
          error,
        );
      } finally {
        setLoadingCommitSha(null);
      }

      // Small delay to avoid rate limiting
      if (processed < totalCommits) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    setLoadingStage("");
    setLoadingProgress(undefined);
    updateState({
      isProcessing: false,
      progress: `Completed: ${successful.length} successful, ${failed.length} failed`,
    });

    if (failed.length > 0) {
      console.warn("Some commits failed to analyze:", failed);
      updateState({
        error: `${failed.length} commit(s) failed to analyze. Check console for details.`,
      });
    }

    // Load the last successfully analyzed commit's graph
    if (successful.length > 0) {
      const lastCommit = commits.find((c) => successful.includes(c.sha));
      if (lastCommit) {
        await handleLoadGraph(lastCommit);
      }
    }
  };

  const handleNewProject = () => {
    // Show warning dialog if there's existing data
    if (
      state.graph &&
      (state.graph.nodes.length > 0 || state.graph.relationships.length > 0)
    ) {
      setShowNewProjectWarning(true);
    } else {
      // No data to lose, proceed directly
      performNewProject();
    }
  };

  const performNewProject = () => {
    updateState({
      ...initialState,
      showStats: false,
    });
    setShowNewProjectWarning(false);
    setIsGraphFullScreen(false);
  };

  const cancelNewProject = () => {
    setShowNewProjectWarning(false);
  };

  const handleDownloadGraph = () => {
    if (!state.graph) {
      alert(
        "No knowledge graph to download. Please process a repository first.",
      );
      return;
    }

    // Show the export format modal
    updateState({ showExportModal: true });
  };

  const handleExportFormatSelect = (format: ExportFormat) => {
    try {
      const projectName = state.githubUrl
        ? state.githubUrl.split("/").pop()?.replace(".git", "") || "repository"
        : "project";

      if (format === "csv") {
        exportAndDownloadGraphAsCSV(state.graph!, {
          projectName,
          includeTimestamp: true,
        });
        console.log("Knowledge graph exported as CSV successfully");
      } else {
        exportAndDownloadGraph(
          state.graph!,
          {
            projectName,
            includeTimestamp: true,
            prettyPrint: true,
            includeMetadata: true,
          },
          state.fileContents,
        );
        console.log("Knowledge graph exported as JSON successfully");
      }
    } catch (error) {
      console.error("Failed to export graph:", error);
      alert("Failed to export knowledge graph. Please try again.");
    }
  };

  const handleCloseExportModal = () => {
    updateState({ showExportModal: false });
  };

  const isApiKeyValid = (() => {
    const currentApiKey = getCurrentProviderApiKey();
    if (settings.llmProvider === "azure-openai") {
      // For Azure OpenAI, we need to validate all required fields
      return (
        llmService.validateApiKey(settings.llmProvider, currentApiKey) &&
        settings.azureOpenAIEndpoint.trim() !== "" &&
        settings.azureOpenAIDeploymentName.trim() !== ""
      );
    }
    return llmService.validateApiKey(settings.llmProvider, currentApiKey);
  })();
  const isGraphValid =
    state.graph &&
    state.graph.nodes &&
    Array.isArray(state.graph.nodes) &&
    state.graph.relationships &&
    Array.isArray(state.graph.relationships);

  const colors = {
    background: "#010314",
    backgroundAlt: "#080c1a",
    surface: "rgba(10, 15, 30, 0.9)",
    surfaceAlt: "rgba(15, 25, 45, 0.7)",
    surfaceBorder: "rgba(148, 163, 184, 0.35)",
    surfaceWarm: "rgba(59, 66, 100, 0.45)",
    primary: "#38bdf8",
    primaryLight: "#67e8f9",
    primaryDark: "#0ea5e9",
    secondary: "#a855f7",
    secondaryLight: "#d8b4fe",
    accent: "#f97316",
    accentLight: "#fdba74",
    text: "#f8fafc",
    textSecondary: "#cbd5f5",
    textTertiary: "#94a3b8",
    textMuted: "#6b7a90",
    border: "rgba(148, 163, 184, 0.25)",
    borderDark: "rgba(148, 163, 184, 0.45)",
    success: "#22c55e",
    warning: "#fbbf24",
    error: "#f87171",
    errorLight: "rgba(248, 113, 113, 0.18)",
  };

  const styles = {
    container: {
      position: "relative" as const,
      minHeight: "100vh",
      height: "100vh",
      width: "100%",
      background:
        "radial-gradient(circle at 5% 15%, rgba(56,189,248,0.2), transparent 45%)," +
        "radial-gradient(circle at 80% 10%, rgba(168,85,247,0.2), transparent 35%)," +
        colors.background,
      color: colors.text,
      padding: "16px",
      boxSizing: "border-box" as const,
      overflow: "hidden",
      fontFamily:
        "'Space Grotesk', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      display: "flex",
      flexDirection: "column" as const,
      overflow: "hidden",
    },

    mainContent: {
      display: "flex",
      flexDirection: "column" as const,
      flex: "1 1 auto",
      minHeight: 0,
      height: "100%",
      overflow: "hidden",
      gap: "12px",
    },

    welcomeOverlay: {
      position: "relative" as const,
      width: "100%",
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "16px 12px",
      boxSizing: "border-box" as const,
      overflow: "hidden",
    },

    heroGrid: {
      display: "grid",
      gridTemplateColumns: "minmax(0, 1.6fr) minmax(280px, 1fr)",
      gap: "12px",
      width: "min(1000px, 98vw)",
      maxWidth: "100%",
      boxSizing: "border-box" as const,
    },

    heroPanel: {
      background:
        "linear-gradient(140deg, rgba(2,6,23,0.92) 0%, rgba(8,47,73,0.95) 45%, rgba(30,27,75,0.9) 100%)",
      borderRadius: "10px",
      padding: "20px",
      border: `1px solid ${colors.borderDark}`,
      boxShadow: "0 40px 120px rgba(2,6,23,0.65)",
      position: "relative" as const,
      overflow: "hidden",
      boxSizing: "border-box" as const,
      width: "100%",
      maxWidth: "100%",
    },

    heroBadge: {
      display: "inline-flex",
      alignItems: "center",
      gap: "8px",
      padding: "6px 14px",
      borderRadius: "999px",
      fontSize: "10px",
      letterSpacing: "0.2em",
      textTransform: "uppercase" as const,
      background: "rgba(56,189,248,0.15)",
      border: `1px solid ${colors.border}`,
      color: colors.textSecondary,
    },

    heroTitle: {
      fontSize: "24px",
      lineHeight: 1.1,
      margin: "16px 0 8px",
      fontWeight: 600,
      textShadow: "0 15px 40px rgba(0,0,0,0.45)",
    },

    heroSubtitle: {
      fontSize: "11px",
      color: colors.textSecondary,
      lineHeight: 1.6,
      maxWidth: "520px",
    },

    heroStats: {
      marginTop: "20px",
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gap: "16px",
    },

    heroStatCard: {
      padding: "18px",
      borderRadius: "10px",
      border: `1px solid ${colors.border}`,
      background: "rgba(255,255,255,0.03)",
      backdropFilter: "blur(18px)",
      display: "flex",
      flexDirection: "column" as const,
      gap: "4px",
    },

    heroStatLabel: {
      fontSize: "10px",
      textTransform: "uppercase" as const,
      letterSpacing: "0.2em",
      color: colors.textMuted,
    },

    heroStatValue: {
      fontSize: "24px",
      fontWeight: 600,
    },

    heroStatMeta: {
      fontSize: "11px",
      color: colors.textSecondary,
    },

    heroTimeline: {
      marginTop: "24px",
      display: "flex",
      flexDirection: "column" as const,
      gap: "14px",
    },

    timelineItem: {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      padding: "10px 14px",
      borderRadius: "10px",
      background: "rgba(255,255,255,0.02)",
      border: `1px solid ${colors.border}`,
    },

    timelineAccent: {
      width: "32px",
      height: "32px",
      borderRadius: "8px",
      background: "rgba(56,189,248,0.12)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: 600,
      color: colors.primaryLight,
    },

    actionPanel: {
      display: "flex",
      flexDirection: "column" as const,
      gap: "12px",
      width: "100%",
      maxWidth: "100%",
      boxSizing: "border-box" as const,
      overflow: "hidden",
    },

    actionCard: {
      background: colors.surface,
      borderRadius: "18px",
      border: `1px solid ${colors.surfaceBorder}`,
      padding: "14px",
      boxShadow: "0 30px 80px rgba(2,6,23,0.55)",
      boxSizing: "border-box" as const,
      overflow: "hidden",
      width: "100%",
      maxWidth: "100%",
    },

    inputSection: {
      display: "flex",
      flexDirection: "column" as const,
      gap: "12px",
    },

    inputGroup: {
      display: "flex",
      flexDirection: "column" as const,
      gap: "6px",
      textAlign: "left" as const,
    },

    label: {
      fontSize: "10px",
      textTransform: "uppercase" as const,
      letterSpacing: "0.2em",
      color: colors.textMuted,
    },

    input: {
      padding: "8px 10px",
      borderRadius: "8px",
      border: `1px solid ${colors.border}`,
      background: "rgba(2,6,23,0.8)",
      color: colors.text,
      fontSize: "10px",
      fontFamily: "inherit",
      transition: "border 0.2s ease, box-shadow 0.2s ease",
    },

    primaryButton: {
      padding: "8px 12px",
      borderRadius: "999px",
      border: "none",
      background:
        "linear-gradient(120deg, #38bdf8 0%, #6366f1 45%, #a855f7 100%)",
      color: "#0b1120",
      fontWeight: 600,
      fontSize: "10px",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "8px",
      boxShadow: "0 20px 60px rgba(56,189,248,0.35)",
      transition: "transform 0.2s ease",
    },

    secondaryButton: {
      padding: "8px 14px",
      borderRadius: "10px",
      border: `1px solid ${colors.border}`,
      background: "transparent",
      color: colors.text,
      fontSize: "10px",
      fontWeight: 500,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "8px",
    },

    ghostButton: {
      padding: "8px 12px",
      borderRadius: "10px",
      border: `1px solid ${colors.border}`,
      background: "rgba(255,255,255,0.02)",
      color: colors.text,
      fontSize: "11px",
      fontWeight: 500,
      display: "flex",
      alignItems: "center",
      gap: "8px",
      cursor: "pointer",
    },

    topBar: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "12px",
      padding: "12px 16px",
      borderRadius: "16px",
      background: colors.surface,
      border: `1px solid ${colors.surfaceBorder}`,
      boxShadow: "0 25px 60px rgba(2,6,23,0.55)",
    },

    brand: {
      display: "flex",
      flexDirection: "column" as const,
      gap: "4px",
    },

    brandName: {
      fontSize: "14px",
      letterSpacing: "0.38em",
      textTransform: "uppercase" as const,
      fontWeight: 600,
    },

    brandSubtitle: {
      fontSize: "11px",
      color: colors.textMuted,
    },

    chipRow: {
      display: "flex",
      flexWrap: "wrap" as const,
      gap: "12px",
      justifyContent: "center",
    },

    infoChip: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "10px 14px",
      borderRadius: "999px",
      border: `1px solid ${colors.border}`,
      background: "rgba(255,255,255,0.03)",
      fontSize: "11px",
      color: colors.textSecondary,
    },

    controlDock: {
      display: "flex",
      alignItems: "center",
      gap: "10px",
    },

    workspace: {
      marginTop: "0",
      display: "grid",
      gridTemplateColumns: "minmax(0, 2fr) minmax(320px, 1fr)",
      gap: "12px",
      flex: 1,
      minHeight: 0,
      height: "100%",
      alignItems: "stretch",
    },

    workspaceFullscreen: {
      gridTemplateColumns: "1fr",
    },

    graphPanel: {
      background: colors.surface,
      borderRadius: "10px",
      border: `1px solid ${colors.surfaceBorder}`,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column" as const,
      minHeight: 0,
      height: "100%",
    },
    graphFullSpan: {
      gridColumn: "1 / -1",
    },

    chatPanel: {
      background: colors.surface,
      borderRadius: "10px",
      border: `1px solid ${colors.surfaceBorder}`,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column" as const,
      minHeight: 0,
      height: "100%",
    },

    panelHeader: {
      padding: "20px 24px",
      borderBottom: `1px solid ${colors.surfaceBorder}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      color: colors.textSecondary,
    },

    panelHeaderRight: {
      display: "flex",
      alignItems: "center",
      gap: "10px",
    },

    smallIconButton: {
      border: `1px solid ${colors.border}`,
      borderRadius: "8px",
      background: "rgba(255,255,255,0.02)",
      color: colors.text,
      padding: "6px 12px",
      fontSize: "10px",
      cursor: "pointer",
      transition: "all 0.2s ease",
    },

    statsPanel: {
      marginTop: "20px",
      background: colors.surfaceAlt,
      border: `1px solid ${colors.surfaceBorder}`,
      borderRadius: "24px",
      padding: "24px",
      boxShadow: "0 20px 60px rgba(2,6,23,0.45)",
    },

    statsSectionTitle: {
      fontSize: "11px",
      fontWeight: 600,
      marginBottom: "16px",
      color: colors.textSecondary,
    },

    statsGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      gap: "18px",
    },

    statsBlock: {
      padding: "16px",
      borderRadius: "18px",
      background: "rgba(255,255,255,0.02)",
      border: `1px solid ${colors.surfaceBorder}`,
      fontSize: "11px",
      color: colors.textSecondary,
    },

    statBadge: {
      display: "inline-flex",
      alignItems: "center",
      gap: "8px",
      padding: "6px 12px",
      borderRadius: "999px",
      background: "rgba(56,189,248,0.12)",
      color: colors.primaryLight,
      fontSize: "10px",
      textTransform: "uppercase" as const,
      letterSpacing: "0.1em",
    },

    errorBanner: {
      background: colors.errorLight,
      border: `1px solid ${colors.error}`,
      color: colors.error,
      padding: "8px 10px",
      borderRadius: "10px",
      fontSize: "11px",
    },

    progressBanner: {
      background: "rgba(34,197,94,0.12)",
      border: `1px solid rgba(34,197,94,0.35)`,
      color: colors.success,
      padding: "8px 10px",
      borderRadius: "10px",
      fontSize: "11px",
      display: "flex",
      alignItems: "center",
      gap: "10px",
    },

    spinner: {
      width: "16px",
      height: "16px",
      border: `2px solid ${colors.border}`,
      borderTop: `2px solid ${colors.primary}`,
      borderRadius: "50%",
      animation: "spin 0.8s linear infinite",
    },
  };

  const renderWelcomeScreen = () => {
    const heroSteps = [
      {
        label: "01",
        title: "Connect & sync",
        detail: "Secure OAuth with GitHub, including private repositories.",
      },
      {
        label: "02",
        title: "Index the graph",
        detail: "Generate call graphs, ownership, and dependency edges in minutes.",
      },
      {
        label: "03",
        title: "Collaborate with AI",
        detail: "Chat with a contextual twin that understands every commit and file.",
      },
    ];

    const heroMetrics = [
      {
        label: "Graph nodes",
        value: state.graph?.nodes?.length
          ? state.graph.nodes.length.toLocaleString()
          : "5k+",
        meta: state.graph
          ? "Nodes in current workspace"
          : "Average nodes per repository",
      },
      {
        label: "Insight latency",
        value: state.isProcessing ? "Live" : "< 90s",
        meta: "Typical ingestion time for 1000 files",
      },
    ];

    return (
      <div style={styles.welcomeOverlay}>
        <div style={styles.heroGrid} data-layout="hero-grid">
          <section style={styles.heroPanel} data-hero="intro">
            <div style={styles.heroBadge}>Eulon Nexus / Cognitive Graph Suite</div>
            <h1 style={styles.heroTitle}>
              Ship confident refactors with a concierge-grade code atlas
            </h1>
            <p style={styles.heroSubtitle}>
              Eulon Nexus analyzes repositories, threads together a semantic graph,
              and gives your team a high-bandwidth canvas to explore architecture,
              history, and intent without jumping across tabs.
            </p>
            {isGraphValid && (
              <div style={{ marginTop: "20px" }}>
                <button
                  style={{
                    ...styles.secondaryButton,
                    borderColor: colors.primary,
                    color: colors.primaryLight,
                  }}
                  onClick={() => updateState({ showWelcome: false })}
                >
                  ⬅️ Return to workspace
                </button>
              </div>
            )}

            <div style={styles.heroStats}>
              {heroMetrics.map((metric) => (
                <div key={metric.label} style={styles.heroStatCard}>
                  <div style={styles.heroStatLabel}>{metric.label}</div>
                  <div style={styles.heroStatValue}>{metric.value}</div>
                  <div style={styles.heroStatMeta}>{metric.meta}</div>
                </div>
              ))}
            </div>

            <div style={styles.heroTimeline}>
              {heroSteps.map((step) => (
                <div key={step.label} style={styles.timelineItem}>
                  <div style={styles.timelineAccent}>{step.label}</div>
                  <div>
                    <div
                      style={{ fontWeight: 600, color: colors.text, fontSize: "15px" }}
                    >
                      {step.title}
                    </div>
                    <div style={{ color: colors.textSecondary, fontSize: "13px" }}>
                      {step.detail}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section style={styles.actionPanel} data-hero="actions">
            {state.error && (
              <div
                style={{
                  ...styles.errorBanner,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                }}
              >
                <span style={{ fontSize: "16px", flexShrink: 0 }}>⚠️</span>
                <div>{state.error}</div>
              </div>
            )}

            {state.isProcessing && (
              <div style={styles.progressBanner}>
                <div style={styles.spinner}></div>
                <div style={{ flex: 1 }}>
                  {loadingStage && (
                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        marginBottom: "4px",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                      }}
                    >
                      {loadingStage}
                    </div>
                  )}
                  <div style={{ fontSize: "13px" }}>{state.progress}</div>
                  {loadingProgress !== undefined && (
                    <div
                      style={{
                        marginTop: "8px",
                        width: "100%",
                        height: "3px",
                        backgroundColor: colors.border,
                        borderRadius: "2px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${loadingProgress}%`,
                          height: "100%",
                          backgroundColor: colors.success,
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            <div style={styles.actionCard}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "12px",
                }}
              >
                <div>
                  <div style={{ fontSize: "12px", fontWeight: 600 }}>GitHub Workspace</div>
                  <div style={{ fontSize: "11px", color: colors.textSecondary }}>
                    Authenticate once, then pull entire organizations into the graph.
                  </div>
                </div>
                <div style={styles.statBadge}>OAuth</div>
              </div>

              <GitHubConnectCard
                onConnected={() => {
                  setIsGitHubConnected(true);
                }}
              />

              <button
                onClick={() => {
                  if (!isGitHubConnected) {
                    alert("Please connect your GitHub account first.");
                    return;
                  }
                  setShowGitHubRepoPicker(true);
                }}
                style={{ ...styles.primaryButton, width: "100%" }}
              >
                <span>📡</span>
                Launch repository selector
              </button>

              {githubImportMessage && (
                <div
                  style={{
                    marginTop: "10px",
                    fontSize: "10px",
                    color: colors.textSecondary,
                  }}
                >
                  {githubImportMessage}
                </div>
              )}
            </div>

            <div style={styles.actionCard}>
              <div style={{ marginBottom: "10px" }}>
                <div style={{ fontSize: "12px", fontWeight: 600 }}>Manual Upload</div>
                <div style={{ fontSize: "11px", color: colors.textSecondary }}>
                  Drop a ZIP archive to build a graph locally without credentials.
                </div>
              </div>

              <RepositoryInput
                onZipFileSubmit={(file) =>
                  handleFileUpload({
                    target: { files: [file] },
                  } as unknown as React.ChangeEvent<HTMLInputElement>)
                }
                disabled={state.isProcessing}
              />
            </div>

            <button
              onClick={() => updateState({ showSettings: true })}
              style={{ ...styles.ghostButton, width: "100%" }}
            >
              ⚙️ Environment & provider settings
            </button>
          </section>
        </div>
      </div>
    );
  };

  const renderMainInterface = () => {
    if (!isGraphValid) {
      console.warn(
        "Attempted to render main interface with invalid graph:",
        state.graph,
      );
      return renderWelcomeScreen();
    }

    const repoLabel = currentRepoInfo
      ? `${currentRepoInfo.owner}/${currentRepoInfo.repo}`
      : state.githubUrl
        ? state.githubUrl.split("/").slice(-2).join("/")
        : "Offline workspace";

    const overviewChips = [
      { icon: "🧠", label: `${state.graph?.nodes.length || 0} nodes` },
      {
        icon: "🕸️",
        label: `${state.graph?.relationships.length || 0} relationships`,
      },
      { icon: "📁", label: `${state.fileContents?.size || 0} files` },
    ];

    const activeCommitLabel = (() => {
      if (!currentCommitSha) return null;
      const commit = commitTimeline?.commits.find(
        (c) => c.sha === currentCommitSha,
      );
      const message = commit?.message.split("\n")[0] ?? "";
      const trimmed =
        message.length > 28 ? `${message.substring(0, 28)}…` : message;
      return `${currentCommitSha.substring(0, 7)}${trimmed ? ` · ${trimmed}` : ""}`;
    })();

    const nodeStatsEntries = (() => {
      if (!state.graph) return [];
      const nodeStats: Record<string, number> = {};
      state.graph.nodes.forEach((node) => {
        nodeStats[node.label] = (nodeStats[node.label] || 0) + 1;
      });
      return Object.entries(nodeStats)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 6);
    })();

    const relationshipStatsEntries = (() => {
      if (!state.graph) return [];
      const relationshipStats: Record<string, number> = {};
      state.graph.relationships.forEach((rel) => {
        relationshipStats[rel.type] =
          (relationshipStats[rel.type] || 0) + 1;
      });
      return Object.entries(relationshipStats)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 6);
    })();

    const sourceFileCount = Array.from(state.fileContents.keys()).filter(
      (path) =>
        path.endsWith(".py") ||
        path.endsWith(".js") ||
        path.endsWith(".ts") ||
        path.endsWith(".tsx") ||
        path.endsWith(".jsx"),
    ).length;

    const workspaceStyle = isGraphFullScreen
      ? { ...styles.workspace, ...styles.workspaceFullscreen }
      : styles.workspace;

    const graphPanelStyle = isGraphFullScreen
      ? { ...styles.graphPanel, ...styles.graphFullSpan }
      : styles.graphPanel;

    return (
      <div style={styles.mainContent}>
        <div style={styles.topBar} data-layout="top-bar">
          <div style={styles.brand}>
            <div style={styles.brandName}>EULON NEXUS</div>
            <div style={styles.brandSubtitle}>{repoLabel}</div>
          </div>

          <div style={styles.chipRow}>
            {overviewChips.map((chip) => (
              <div key={chip.label} style={styles.infoChip}>
                <span>{chip.icon}</span>
                <span>{chip.label}</span>
              </div>
            ))}
            {activeCommitLabel && (
              <div
                style={{
                  ...styles.infoChip,
                  borderColor: colors.primary,
                  color: colors.primaryLight,
                }}
              >
                <span>📌</span>
                <span>{activeCommitLabel}</span>
              </div>
            )}
          </div>

          <div style={styles.controlDock}>
            <button
              style={styles.ghostButton}
              onClick={() => updateState({ showWelcome: true })}
            >
              🏠 Home
            </button>
            <button
              style={styles.ghostButton}
              onClick={async () => {
                updateState({ showHistory: true });

                let repoInfo = currentRepoInfo;

                if (!repoInfo && state.githubUrl) {
                  const urlMatch = state.githubUrl.match(
                    /github\.com\/([^/]+)\/([^/]+)/,
                  );
                  if (urlMatch) {
                    const [, owner, repo] = urlMatch;
                    repoInfo = { owner, repo };
                    setCurrentRepoInfo(repoInfo);
                    console.log(
                      `📦 Extracted repo info from URL: ${owner}/${repo}`,
                    );
                  }
                }

                if (repoInfo && !commitTimeline && !historyLoading) {
                  try {
                    console.log(
                      `📜 Fetching commit history for ${repoInfo.owner}/${repoInfo.repo}...`,
                    );
                    console.log(
                      `🔑 GitHub token available: ${githubToken ? "YES" : "NO"}`,
                    );

                    setLoadingStage("Fetching History");
                    setLoadingProgress(50);

                    const timeline = await fetchCommitHistory(
                      repoInfo.owner,
                      repoInfo.repo,
                      { maxCommits: 100 },
                    );

                    setLoadingStage("");
                    setLoadingProgress(undefined);
                    console.log(`✅ Successfully fetched commit history`);

                    if (timeline && timeline.commits.length > 0) {
                      const latestCommit = timeline.commits[0];
                      const hasGraph = analyzedCommits.has(latestCommit.sha);

                      if (hasGraph && repoInfo) {
                        console.log(
                          `🔄 Auto-loading latest commit graph: ${latestCommit.sha.substring(0, 7)}`,
                        );
                        try {
                          const graph = await loadGraph(
                            repoInfo.owner,
                            repoInfo.repo,
                            latestCommit.sha,
                          );
                          if (graph) {
                            setCurrentCommitSha(latestCommit.sha);
                            updateState({ graph, fileContents: new Map() });
                          }
                        } catch (err) {
                          console.warn(
                            "Failed to auto-load latest commit graph:",
                            err,
                          );
                        }
                      } else if (!hasGraph) {
                        console.log(
                          `🔄 Auto-analyzing latest commit: ${latestCommit.sha.substring(0, 7)}`,
                        );
                        try {
                          const githubToken = getGitHubAccessToken();
                          const ingestionService = new IngestionService(
                            githubToken,
                          );
                          const result =
                            await ingestionService.processGitHubRepo(
                              `https://github.com/${repoInfo.owner}/${repoInfo.repo}`,
                              {
                                directoryFilter: state.directoryFilter,
                                fileExtensions: state.fileExtensions,
                                ref: latestCommit.sha,
                                onProgress: (message: string) => {
                                  updateState({ progress: message });
                                },
                              },
                            );
                          await storeGraph(
                            repoInfo.owner,
                            repoInfo.repo,
                            latestCommit.sha,
                            latestCommit.message,
                            latestCommit.author?.date ||
                              new Date().toISOString(),
                            result.graph,
                          );
                          setCurrentCommitSha(latestCommit.sha);
                          setAnalyzedCommits(
                            (prev) => new Set([...prev, latestCommit.sha]),
                          );
                          updateState({
                            graph: result.graph,
                            fileContents: result.fileContents,
                            progress: "",
                          });
                        } catch (err) {
                          console.warn(
                            "Failed to auto-analyze latest commit:",
                            err,
                          );
                        }
                      }
                    }
                  } catch (error) {
                    console.error("❌ Failed to fetch commit history:", error);
                    setLoadingStage("");
                    setLoadingProgress(undefined);
                  }
                } else if (!repoInfo) {
                  console.warn(
                    "⚠️ No repository info available. Cannot fetch commit history.",
                  );
                }
              }}
            >
              🕒 History
            </button>
            <button
              style={{
                ...styles.ghostButton,
                backgroundColor: state.showStats
                  ? "rgba(99,102,241,0.18)"
                  : "rgba(255,255,255,0.02)",
                borderColor: state.showStats ? colors.primary : colors.border,
                color: state.showStats ? colors.primaryLight : colors.text,
              }}
              onClick={() => updateState({ showStats: !state.showStats })}
            >
              📊 Stats
            </button>
            <button
              onClick={handleDownloadGraph}
              disabled={!state.graph}
              style={{
                ...styles.primaryButton,
                padding: "8px 14px",
                borderRadius: "18px",
                opacity: state.graph ? 1 : 0.5,
                cursor: state.graph ? "pointer" : "not-allowed",
              }}
            >
              <span>📥</span>
              Export graph
            </button>
            <button
              onClick={handleNewProject}
              style={{
                ...styles.secondaryButton,
                padding: "8px 14px",
                borderRadius: "18px",
              }}
            >
              🔄 New project
            </button>
          </div>
        </div>

        {state.showStats && state.graph && (
          <div style={styles.statsPanel}>
            <div style={styles.statsSectionTitle}>Workspace diagnostics</div>
            <div style={styles.statsGrid}>
              <div style={styles.statsBlock}>
                <div
                  style={{
                    fontWeight: 600,
                    color: colors.text,
                    marginBottom: "8px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span>🔵</span> Node types
                </div>
                {nodeStatsEntries.length === 0 ? (
                  <div style={{ color: colors.textMuted }}>No data</div>
                ) : (
                  nodeStatsEntries.map(([type, count]) => (
                    <div
                      key={type}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        color: colors.textSecondary,
                        marginBottom: "6px",
                        padding: "6px 8px",
                        borderRadius: "8px",
                        background: "rgba(56,189,248,0.08)",
                      }}
                    >
                      <span>{type}</span>
                      <span style={{ color: colors.primaryLight }}>
                        {count}
                      </span>
                    </div>
                  ))
                )}
              </div>

              <div style={styles.statsBlock}>
                <div
                  style={{
                    fontWeight: 600,
                    color: colors.text,
                    marginBottom: "8px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span>🔗</span> Relationship mix
                </div>
                {relationshipStatsEntries.length === 0 ? (
                  <div style={{ color: colors.textMuted }}>No data</div>
                ) : (
                  relationshipStatsEntries.map(([type, count]) => (
                    <div
                      key={type}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        color: colors.textSecondary,
                        marginBottom: "6px",
                        padding: "6px 8px",
                        borderRadius: "8px",
                        background: "rgba(168,85,247,0.08)",
                      }}
                    >
                      <span>{type}</span>
                      <span style={{ color: colors.secondaryLight }}>
                        {count}
                      </span>
                    </div>
                  ))
                )}
              </div>

              <div style={styles.statsBlock}>
                <div
                  style={{
                    fontWeight: 600,
                    color: colors.text,
                    marginBottom: "8px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span>📁</span> Repository overview
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "6px",
                    color: colors.textSecondary,
                  }}
                >
                  <span>Total files</span>
                  <span style={{ color: colors.accentLight }}>
                    {state.fileContents.size}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "6px",
                    color: colors.textSecondary,
                  }}
                >
                  <span>Source files</span>
                  <span style={{ color: colors.accentLight }}>
                    {sourceFileCount}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    color: colors.textSecondary,
                  }}
                >
                  <span>Workspace</span>
                  <span style={{ color: colors.accentLight }}>
                    {repoLabel}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={workspaceStyle} data-layout="workspace-grid">
          <div style={graphPanelStyle} data-panel="graph">
            <div style={styles.panelHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span>🌌</span>
                <div>
                  <div style={{ fontWeight: 600, color: colors.text }}>
                    Knowledge graph
                  </div>
                  <div style={{ fontSize: "12px", color: colors.textMuted }}>
                    {state.graph?.nodes.length || 0} nodes mapped
                  </div>
                </div>
              </div>
              <div style={styles.panelHeaderRight}>
                {activeCommitLabel && (
                  <div
                    style={{
                      ...styles.infoChip,
                      borderColor: colors.primary,
                      color: colors.primaryLight,
                    }}
                  >
                    <span>Commit</span>
                    <span>{activeCommitLabel}</span>
                  </div>
                )}
                <button
                  style={{
                    ...styles.smallIconButton,
                    backgroundColor: isGraphFullScreen
                      ? colors.primary
                      : "rgba(255,255,255,0.02)",
                    color: isGraphFullScreen ? "#0b1120" : colors.text,
                    borderColor: isGraphFullScreen
                      ? colors.primaryLight
                      : colors.border,
                  }}
                  onClick={() => setIsGraphFullScreen((prev) => !prev)}
                >
                  {isGraphFullScreen ? "Exit Fullscreen" : "Fullscreen"}
                </button>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <GraphExplorer
                key={currentCommitSha || 'default'} // Force re-render when commit changes
                graph={state.graph!}
                isLoading={state.isLoading}
                onNodeSelect={handleNodeSelect}
                fileContents={state.fileContents}
              />
            </div>
          </div>

          {!isGraphFullScreen && (
            <div style={styles.chatPanel} data-panel="chat">
              <div style={styles.panelHeader}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span>🤖</span>
                  <div>
                    <div style={{ fontWeight: 600, color: colors.text }}>
                      Conversational copilot
                    </div>
                    <div style={{ fontSize: "12px", color: colors.textMuted }}>
                      LLM-assisted exploration with repository context
                    </div>
                  </div>
                </div>
              </div>
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {isApiKeyValid ? (
                  <ChatInterface
                    graph={state.graph!}
                    fileContents={state.fileContents}
                    style={{ height: "100%" }}
                  />
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "16px",
                      padding: "24px",
                      textAlign: "center",
                      color: colors.textMuted,
                      height: "100%",
                    }}
                  >
                    <div style={{ fontSize: "48px", opacity: 0.3 }}>🔑</div>
                    <div>Configure your API key to use the chat interface</div>
                    <button
                      onClick={() => updateState({ showSettings: true })}
                      style={styles.secondaryButton}
                    >
                      Open Settings
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Parse progress message to extract stage and progress
  const parseProgress = (message: string) => {
    let stage = "";
    let progress: number | undefined = undefined;
    let subMessage = message;

    // Extract stage from common patterns
    if (message.includes("Downloading")) {
      stage = "Downloading";
    } else if (
      message.includes("Extracting") ||
      message.includes("Reading ZIP")
    ) {
      stage = "Extracting";
    } else if (
      message.includes("Processing") ||
      message.includes("Discovering")
    ) {
      stage = "Processing";
    } else if (
      message.includes("Generating") ||
      message.includes("Analyzing")
    ) {
      stage = "Analyzing";
    } else if (message.includes("Saving") || message.includes("Storing")) {
      stage = "Saving";
    } else if (message.includes("Loading")) {
      stage = "Loading";
    }

    // Extract progress percentage if available
    const progressMatch = message.match(/(\d+)%/);
    if (progressMatch) {
      progress = parseInt(progressMatch[1]);
    }

    // Extract progress from "X/Y" format
    const countMatch = message.match(/(\d+)\/(\d+)/);
    if (countMatch && !progress) {
      const current = parseInt(countMatch[1]);
      const total = parseInt(countMatch[2]);
      progress = Math.round((current / total) * 100);
      subMessage = `${message} (${progress}%)`;
    }

    return { stage, progress, subMessage };
  };

  const progressInfo = state.progress ? parseProgress(state.progress) : null;

  return (
    <ErrorBoundary>
      {/* Global Loading Indicator */}
      <LoadingIndicator
        isVisible={state.isProcessing || !!loadingCommitSha}
        message={
          state.progress ||
          (loadingCommitSha ? "Processing commit..." : "Loading...")
        }
        stage={
          progressInfo?.stage ||
          loadingStage ||
          (loadingCommitSha ? "Analyzing Commit" : undefined)
        }
        progress={progressInfo?.progress || loadingProgress}
        subMessage={
          progressInfo?.subMessage ||
          (loadingCommitSha
            ? `Commit: ${loadingCommitSha.substring(0, 7)}`
            : undefined)
        }
        size="large"
      />

      <div style={styles.container}>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          
          @keyframes slideDown {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
          }

          *, *::before, *::after {
            box-sizing: border-box;
          }
          
          html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            min-height: 100%;
            background: ${colors.background};
            color: ${colors.text};
            font-family: 'Space Grotesk', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          }

          body {
            display: flex;
            flex-direction: column;
          }
          
          #root {
            min-height: 100vh;
            width: 100%;
          }

          button {
            font-family: inherit;
            transition: transform 0.2s ease;
          }
          
          button:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow: 0 12px 30px rgba(2,6,23,0.45);
          }
          
          button:active:not(:disabled) {
            transform: translateY(0);
          }

          button:disabled {
            cursor: not-allowed;
          }

          input:focus, textarea:focus, select:focus {
            border-color: ${colors.primary} !important;
            box-shadow: 0 0 0 3px ${colors.primary}30 !important;
          }

          [data-layout="top-bar"] {
            align-items: center;
          }

          [data-layout="workspace-grid"] {
            height: 100%;
            min-height: 0;
          }

          [data-layout="workspace-grid"] > div {
            min-height: 0;
            height: 100%;
          }

          @media (max-width: 1280px) {
            [data-layout="top-bar"] {
              flex-direction: column;
              align-items: flex-start;
              gap: 16px;
            }
            [data-layout="top-bar"] > div {
              width: 100%;
            }
            [data-layout="top-bar"] > div:nth-child(2) {
              justify-content: flex-start;
            }
            [data-layout="top-bar"] > div:last-child {
              flex-wrap: wrap;
              justify-content: flex-start;
            }
          }

          @media (max-width: 1024px) {
            [data-layout="hero-grid"] {
              grid-template-columns: 1fr;
            }
            [data-hero="actions"] {
              order: -1;
            }
          }

          @media (max-width: 900px) {
            [data-layout="workspace-grid"] {
              grid-template-columns: 1fr;
              height: auto;
            }
            [data-panel="graph"],
            [data-panel="chat"] {
              min-height: 420px;
              height: auto;
            }
          }

          @media (max-width: 640px) {
            [data-layout="workspace-grid"] {
              height: auto;
            }
            [data-layout="top-bar"] > div:last-child {
              flex-direction: column;
              width: 100%;
            }
            [data-layout="top-bar"] > div:last-child button {
              width: 100%;
              justify-content: center;
            }
            [data-layout="workspace-grid"] > div {
              min-height: 360px;
              height: auto;
            }
          }
        `}</style>

        {state.showWelcome || !isGraphValid
          ? renderWelcomeScreen()
          : renderMainInterface()}

        {/* Settings Modal */}
        {state.showSettings && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 2000,
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                updateState({ showSettings: false });
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                updateState({ showSettings: false });
              }
            }}
            tabIndex={-1}
          >
            <div
              style={{
                backgroundColor: colors.surface,
                borderRadius: "8px",
                padding: "28px",
                maxWidth: "700px",
                width: "90%",
                maxHeight: "80vh",
                overflow: "auto",
                border: `1px solid ${colors.border}`,
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              }}
            >
              <h2
                style={{
                  color: colors.text,
                  marginBottom: "24px",
                  fontSize: "20px",
                  fontWeight: "700",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <span>⚙️</span>
                Settings & Configuration
              </h2>

              {/* GitHub Token Section */}
              <div
                style={{
                  padding: "16px",
                  borderRadius: "6px",
                  backgroundColor: colors.backgroundAlt,
                  border: `1px solid ${colors.border}`,
                  marginBottom: "20px",
                }}
              >
                <h3
                  style={{
                    color: colors.text,
                    marginBottom: "14px",
                    fontSize: "10px",
                    fontWeight: "600",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span>🔑</span>
                  GitHub Configuration
                </h3>

                <div style={styles.inputGroup}>
                  <label style={styles.label}>
                    GitHub Personal Access Token
                  </label>
                  <input
                    type="password"
                    value={state.githubToken}
                    onChange={(e) =>
                      updateState({ githubToken: e.target.value })
                    }
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    style={styles.input}
                  />
                  <div
                    style={{
                      fontSize: "11px",
                      color: colors.textMuted,
                      marginTop: "8px",
                      lineHeight: "1.5",
                    }}
                  >
                    Increases rate limit from 60 to 5,000 requests/hour.
                    <br />
                    Generate at{" "}
                    <a
                      href="https://github.com/settings/tokens"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: colors.primaryLight,
                        textDecoration: "none",
                        fontWeight: "500",
                      }}
                    >
                      github.com/settings/tokens
                    </a>
                  </div>
                </div>
              </div>

              {/* LLM Configuration Section */}
              <div
                style={{
                  padding: "16px",
                  borderRadius: "6px",
                  backgroundColor: colors.backgroundAlt,
                  border: `1px solid ${colors.border}`,
                }}
              >
                <h3
                  style={{
                    color: colors.text,
                    marginBottom: "14px",
                    fontSize: "10px",
                    fontWeight: "600",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span>🤖</span>
                  LLM Configuration
                </h3>

                {/* Provider Selection */}
                <div style={styles.inputGroup}>
                  <label style={styles.label}>LLM Provider</label>
                  <select
                    value={settings.llmProvider}
                    onChange={(e) =>
                      updateSetting(
                        "llmProvider",
                        e.target.value as LLMProvider,
                      )
                    }
                    style={{
                      ...styles.input,
                      cursor: "pointer",
                    }}
                  >
                    <option value="openai">OpenAI</option>
                    <option value="azure-openai">Azure OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="gemini">Google Gemini</option>
                  </select>
                </div>

                {/* API Key */}
                <div style={styles.inputGroup}>
                  <label style={styles.label}>
                    {settings.llmProvider === "azure-openai"
                      ? "Azure OpenAI API Key"
                      : settings.llmProvider === "anthropic"
                        ? "Anthropic API Key"
                        : settings.llmProvider === "gemini"
                          ? "Google API Key"
                          : "OpenAI API Key"}
                  </label>
                  <input
                    type="password"
                    value={getCurrentProviderApiKey()}
                    onChange={(e) =>
                      updateCurrentProviderApiKey(e.target.value)
                    }
                    placeholder={
                      settings.llmProvider === "azure-openai"
                        ? "Your Azure OpenAI key..."
                        : settings.llmProvider === "anthropic"
                          ? "sk-ant-..."
                          : settings.llmProvider === "gemini"
                            ? "Your Google API key..."
                            : "sk-..."
                    }
                    style={styles.input}
                  />
                </div>

                {/* Azure OpenAI Specific Fields */}
                {settings.llmProvider === "azure-openai" && (
                  <>
                    <div style={styles.inputGroup}>
                      <label style={styles.label}>Azure OpenAI Endpoint</label>
                      <input
                        type="text"
                        value={settings.azureOpenAIEndpoint}
                        onChange={(e) =>
                          updateSetting("azureOpenAIEndpoint", e.target.value)
                        }
                        placeholder="https://your-resource.openai.azure.com"
                        style={styles.input}
                      />
                      <div
                        style={{
                          fontSize: "11px",
                          color: colors.textMuted,
                          marginTop: "8px",
                        }}
                      >
                        Your Azure OpenAI resource endpoint
                      </div>
                    </div>

                    <div style={styles.inputGroup}>
                      <label style={styles.label}>Deployment Name</label>
                      <input
                        type="text"
                        value={settings.azureOpenAIDeploymentName}
                        onChange={(e) =>
                          updateSetting(
                            "azureOpenAIDeploymentName",
                            e.target.value,
                          )
                        }
                        placeholder="gpt-4o-mini"
                        style={styles.input}
                      />
                      <div
                        style={{
                          fontSize: "11px",
                          color: colors.textMuted,
                          marginTop: "8px",
                        }}
                      >
                        The deployment name you created in Azure OpenAI Studio
                      </div>
                    </div>

                    <div style={styles.inputGroup}>
                      <label style={styles.label}>API Version</label>
                      <input
                        type="text"
                        value={settings.azureOpenAIApiVersion}
                        onChange={(e) =>
                          updateSetting("azureOpenAIApiVersion", e.target.value)
                        }
                        placeholder="2024-02-01"
                        style={styles.input}
                      />
                      <div
                        style={{
                          fontSize: "11px",
                          color: colors.textMuted,
                          marginTop: "8px",
                        }}
                      >
                        Azure OpenAI API version
                      </div>
                    </div>
                  </>
                )}

                {/* Configuration Status */}
                <div
                  style={{
                    padding: "8px 10px",
                    borderRadius: "6px",
                    backgroundColor: isApiKeyValid
                      ? "#ECFDF5"
                      : colors.errorLight,
                    border: `1px solid ${
                      isApiKeyValid ? "#D1FAE5" : "#FECACA"
                    }`,
                    marginTop: "12px",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      marginTop: "0px",
                      flexShrink: 0,
                    }}
                  >
                    {isApiKeyValid ? "✅" : "❌"}
                  </span>
                  <div>
                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: "600",
                        color: isApiKeyValid ? colors.secondary : colors.error,
                        marginBottom: isApiKeyValid ? 0 : "4px",
                      }}
                    >
                      {isApiKeyValid
                        ? "✅ Configuration Valid"
                        : "❌ Configuration Invalid"}
                    </div>
                    {!isApiKeyValid && (
                      <div style={{ fontSize: "11px", color: colors.error }}>
                        {settings.llmProvider === "azure-openai"
                          ? "Please provide API key, endpoint, and deployment name"
                          : "Please provide a valid API key"}
                      </div>
                    )}
                  </div>
                </div>

                {/* Provider Information */}
                <div
                  style={{
                    padding: "8px 10px",
                    borderRadius: "6px",
                    backgroundColor: colors.backgroundAlt,
                    border: `1px solid ${colors.border}`,
                    marginTop: "12px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "10px",
                      fontWeight: "600",
                      color: colors.text,
                      marginBottom: "6px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <span>📋</span>
                    Provider Information
                  </div>
                  <div
                    style={{
                      fontSize: "10px",
                      color: colors.textSecondary,
                      lineHeight: "1.5",
                    }}
                  >
                    {settings.llmProvider === "openai" &&
                      "Direct OpenAI API. Get your API key from platform.openai.com"}
                    {settings.llmProvider === "azure-openai" &&
                      "Azure OpenAI Service. Requires Azure subscription and deployed model."}
                    {settings.llmProvider === "anthropic" &&
                      "Anthropic Claude API. Get your API key from console.anthropic.com"}
                    {settings.llmProvider === "gemini" &&
                      "Google Gemini API. Get your API key from aistudio.google.com"}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  marginTop: "24px",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  onClick={() => updateState({ showSettings: false })}
                  style={styles.secondaryButton}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    // Save settings to localStorage
                    if (state.githubToken) {
                      localStorage.setItem("github_token", state.githubToken);
                    } else {
                      localStorage.removeItem("github_token");
                    }
                    // Settings are automatically saved via useSettings hook
                    updateState({ showSettings: false });
                  }}
                  style={styles.primaryButton}
                >
                  💾 Save Settings
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Commit History Modal */}
        {state.showHistory && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 2000,
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                updateState({ showHistory: false });
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                updateState({ showHistory: false });
              }
            }}
            tabIndex={-1}
          >
            <div
              style={{
                backgroundColor: colors.surface,
                borderRadius: "16px",
                padding: "24px",
                width: "95%",
                maxWidth: "1200px",
                maxHeight: "85vh",
                overflow: "auto",
                border: `1px solid ${colors.border}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "16px",
                }}
              >
                <h2
                  style={{
                    color: colors.text,
                    margin: 0,
                    fontSize: "20px",
                    fontWeight: 700,
                  }}
                >
                  🕒 Repository Evolution
                </h2>
                <button
                  onClick={() => updateState({ showHistory: false })}
                  style={styles.secondaryButton}
                >
                  Close
                </button>
              </div>

              {!currentRepoInfo ? (
                <div
                  style={{
                    padding: "24px",
                    textAlign: "center",
                    color: colors.textMuted,
                  }}
                >
                  <div style={{ fontSize: "48px", marginBottom: "16px" }}>
                    📦
                  </div>
                  <h3 style={{ color: colors.text, marginBottom: "8px" }}>
                    No Repository Selected
                  </h3>
                  <p style={{ marginBottom: "20px" }}>
                    Connect a GitHub repository to view commit history and
                    analyze different versions of your codebase.
                  </p>
                  <button
                    onClick={() => {
                      updateState({ showHistory: false });
                      setShowGitHubRepoPicker(true);
                    }}
                    style={styles.primaryButton}
                  >
                    Connect GitHub Repository
                  </button>
                </div>
              ) : historyError ? (
                <div
                  style={{
                    padding: "24px",
                    textAlign: "center",
                    color: colors.textMuted,
                  }}
                >
                  <div style={{ fontSize: "48px", marginBottom: "16px" }}>
                    ⚠️
                  </div>
                  <h3 style={{ color: colors.text, marginBottom: "8px" }}>
                    Error Loading Commit History
                  </h3>
                  <p style={{ marginBottom: "20px" }}>{historyError}</p>
                  {currentRepoInfo && (
                    <button
                      onClick={async () => {
                        try {
                          setLoadingStage("Fetching History");
                          setLoadingProgress(50);
                          const timeline = await fetchCommitHistory(
                            currentRepoInfo.owner,
                            currentRepoInfo.repo,
                            { maxCommits: 100 },
                          );
                          setLoadingStage("");
                          setLoadingProgress(undefined);

                          // Auto-load latest commit if available
                          if (timeline && timeline.commits.length > 0) {
                            const latestCommit = timeline.commits[0];
                            const hasGraph = analyzedCommits.has(
                              latestCommit.sha,
                            );
                            if (hasGraph) {
                              const graph = await loadGraph(
                                currentRepoInfo.owner,
                                currentRepoInfo.repo,
                                latestCommit.sha,
                              );
                              if (graph) {
                                setCurrentCommitSha(latestCommit.sha);
                                updateState({ graph, fileContents: new Map() });
                              }
                            }
                          }
                        } catch (error) {
                          console.error("Retry failed:", error);
                          setLoadingStage("");
                          setLoadingProgress(undefined);
                        }
                      }}
                      style={styles.primaryButton}
                    >
                      Retry
                    </button>
                  )}
                </div>
              ) : !commitTimeline && historyLoading ? (
                <div
                  style={{
                    padding: "24px",
                    textAlign: "center",
                    color: colors.textMuted,
                  }}
                >
                  <div style={{ fontSize: "48px", marginBottom: "16px" }}>
                    ⏳
                  </div>
                  <h3 style={{ color: colors.text, marginBottom: "8px" }}>
                    Loading Commit History...
                  </h3>
                  <p>
                    Fetching commits from {currentRepoInfo.owner}/
                    {currentRepoInfo.repo}
                  </p>
                </div>
              ) : commitTimeline ? (
                <>
                  {historyError && (
                    <div
                      style={{ color: colors.textMuted, marginBottom: "12px" }}
                    >
                      ⚠️ Commit history error: {historyError}
                    </div>
                  )}

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(360px, 1fr))",
                      gap: "16px",
                    }}
                  >
                    <ProjectEvolutionStats timeline={commitTimeline} />
                    <CommitHistoryViewer
                      onBatchAnalyze={handleBatchAnalyzeCommits}
                      timeline={commitTimeline}
                      isLoading={historyLoading}
                      analyzedCommits={analyzedCommits}
                      loadingCommitSha={loadingCommitSha}
                      onAnalyzeCommit={handleAnalyzeCommit}
                      onLoadGraph={handleLoadGraph}
                    />
                  </div>
                </>
              ) : (
                <div
                  style={{
                    padding: "24px",
                    textAlign: "center",
                    color: colors.textMuted,
                  }}
                >
                  <div style={{ fontSize: "48px", marginBottom: "16px" }}>
                    📭
                  </div>
                  <h3 style={{ color: colors.text, marginBottom: "8px" }}>
                    No Commit History Available
                  </h3>
                  <p>
                    Unable to load commit history for {currentRepoInfo.owner}/
                    {currentRepoInfo.repo}. Make sure you have access to this
                    repository.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Export Format Modal */}
        <ExportFormatModal
          isOpen={state.showExportModal}
          onClose={handleCloseExportModal}
          onSelectFormat={handleExportFormatSelect}
          projectName={
            state.githubUrl
              ? state.githubUrl.split("/").pop()?.replace(".git", "") ||
                "repository"
              : "project"
          }
        />

        {/* New Project Warning Dialog */}
        <WarningDialog
          isOpen={showNewProjectWarning}
          title="Start New Project"
          message="Starting a new project will permanently delete your current knowledge graph and all analyzed data. This action cannot be undone. Are you sure you want to continue?

Don't worry though - you can always re-upload your previous ZIP file if needed. It only takes a few seconds! 😊"
          confirmText="Yes, Start New Project"
          cancelText="Cancel"
          variant="warning"
          onConfirm={performNewProject}
          onCancel={cancelNewProject}
        />
        <GitHubRepoPicker
          isOpen={showGitHubRepoPicker}
          onClose={() => setShowGitHubRepoPicker(false)}
          onImport={handleGitHubReposImport}
        />

      </div>
    </ErrorBoundary>
  );
};

export default HomePage;
