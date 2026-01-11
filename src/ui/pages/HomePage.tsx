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
import LoadingIndicator from "../components/LoadingIndicator.tsx";

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
    null
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
    new Set()
  );
  const [loadingCommitSha, setLoadingCommitSha] = useState<string | null>(null);
  const [currentRepoInfo, setCurrentRepoInfo] = useState<{
    owner: string;
    repo: string;
  } | null>(null);
  
  // Enhanced progress tracking
  const [loadingStage, setLoadingStage] = useState<string>("");
  const [loadingProgress, setLoadingProgress] = useState<number | undefined>(undefined);

  // Use settings hook for LLM configuration
  const {
    settings,
    updateSetting,
    getCurrentProviderApiKey,
    updateCurrentProviderApiKey,
  } = useSettings();

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
        currentRepoHistory.commits.map((c) => c.commitSha)
      );
      setAnalyzedCommits(storedCommitShas);
      console.log(
        `📊 Synced ${storedCommitShas.size} analyzed commits for ${currentRepoInfo.owner}/${currentRepoInfo.repo}`
      );
    }
  }, [currentRepoInfo, currentRepoHistory]);

  // Fetch repo history when repo is selected
  useEffect(() => {
    if (currentRepoInfo) {
      fetchRepoHistory(currentRepoInfo.owner, currentRepoInfo.repo).catch(
        (err) => {
          console.warn("Failed to fetch repo history:", err);
        }
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
    event: React.ChangeEvent<HTMLInputElement>
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
        }`
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
            if (message.includes("Downloading") || message.includes("archive")) {
              setLoadingStage("Downloading");
              setLoadingProgress(20);
            } else if (message.includes("Extracting") || message.includes("Discovered")) {
              setLoadingStage("Extracting");
              setLoadingProgress(40);
            } else if (message.includes("Generating") || message.includes("Parsing")) {
              setLoadingStage("Analyzing");
              setLoadingProgress(60);
            } else if (message.includes("Resolving") || message.includes("Call")) {
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
            }
          );

          // Get latest commit info if available
          if (historyResult?.commits?.[0]) {
            const latestCommit = historyResult.commits[0];
            latestCommitSha = latestCommit.sha;
            latestCommitMessage = latestCommit.message;
            latestCommitDate = latestCommit.author?.date || latestCommitDate;
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
            }@${latestCommitSha.substring(0, 7)}...`
          );

          await storeGraph(
            repo.owner,
            repo.name,
            latestCommitSha,
            latestCommitMessage,
            latestCommitDate,
            result.graph
          );
          console.log(
            `✅ Graph stored on server for ${repo.owner}/${repo.name}`
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
        "Repository successfully added to your knowledge graph"
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
          } else if (message.includes("Extracting") || message.includes("Discovered")) {
            setLoadingStage("Extracting");
            setLoadingProgress(40);
          } else if (message.includes("Generating") || message.includes("Parsing")) {
            setLoadingStage("Analyzing");
            setLoadingProgress(60);
          } else if (message.includes("Resolving") || message.includes("Call")) {
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
        result.graph
      );

      // Update state
      setLoadingStage("");
      setLoadingProgress(undefined);
      updateState({
        graph: result.graph,
        fileContents: result.fileContents,
        progress: "",
      });

      // Mark as analyzed
      setAnalyzedCommits((prev) => new Set([...prev, commit.sha]));
      console.log(
        `✅ Analyzed and stored graph for commit ${commit.sha.substring(0, 7)}`
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

      const graph = await loadGraph(owner, repo, commit.sha);

      setLoadingStage("");
      setLoadingProgress(undefined);
      if (graph) {
        updateState({
          graph: graph,
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
          }
        );

        // Store graph for this commit
        await storeGraph(
          owner,
          repo,
          commit.sha,
          commit.message,
          commit.author?.date || new Date().toISOString(),
          result.graph
        );

        successful.push(commit.sha);
        setAnalyzedCommits((prev) => new Set([...prev, commit.sha]));
        processed++;

        console.log(
          `✅ [${processed}/${totalCommits}] Analyzed commit ${commit.sha.substring(0, 7)}`
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        failed.push({ sha: commit.sha, error: errorMessage });
        processed++;
        console.error(
          `❌ [${processed}/${totalCommits}] Failed to analyze commit ${commit.sha.substring(0, 7)}:`,
          error
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
  };

  const cancelNewProject = () => {
    setShowNewProjectWarning(false);
  };

  const handleDownloadGraph = () => {
    if (!state.graph) {
      alert(
        "No knowledge graph to download. Please process a repository first."
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
          state.fileContents
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

  // EulonAI-inspired dark, neon palette to match landing + GitHub integration
  const colors = {
    background: "#020617", // near-black slate
    surface: "#020617",
    surfaceWarm: "#020617",
    primary: "#6366F1", // indigo
    primaryLight: "#818CF8",
    secondary: "#22D3EE", // cyan
    accent: "#22C55E", // neon green
    text: "#E5E7EB", // slate-200
    textSecondary: "#9CA3AF", // slate-400
    textMuted: "#64748B", // slate-500
    border: "#1F2937", // slate-800
    borderLight: "#111827", // slate-900
    success: "#22C55E",
    warning: "#FACC15",
    error: "#F97373",
  };

  // Modern styles with warm theme
  const styles = {
    container: {
      display: "flex",
      flexDirection: "column" as const,
      minHeight: "100vh",
      minWidth: "100vw",
      height: "100vh",
      width: "100vw",
      maxHeight: "100vh",
      maxWidth: "100vw",
      background:
        "radial-gradient(circle at top left, rgba(88,28,135,0.55), transparent 55%), radial-gradient(circle at bottom right, rgba(14,165,233,0.5), transparent 55%), #020617",
      fontFamily:
        "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      overflow: "hidden",
      boxSizing: "border-box" as const,
    },

    // Top navbar (only visible when project is loaded)
    navbar: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "12px 24px",
      background:
        "linear-gradient(90deg, rgba(15,23,42,0.95), rgba(30,64,175,0.9))",
      borderBottom: `1px solid ${colors.borderLight}`,
      boxShadow: "0 16px 40px rgba(15,23,42,0.8)",
      position: "relative" as const,
    },

    navbarContent: {
      display: "flex",
      alignItems: "center",
      gap: "16px",
      fontSize: "14px",
      fontWeight: "500",
      color: colors.text,
    },

    navbarButton: {
      padding: "8px 16px",
      backgroundColor: colors.surfaceWarm,
      border: `1px solid ${colors.border}`,
      borderRadius: "8px",
      color: colors.text,
      fontSize: "14px",
      fontWeight: "500",
      cursor: "pointer",
      transition: "all 0.2s ease",
      display: "flex",
      alignItems: "center",
      gap: "8px",
    },

    // Welcome screen (full page, no box)
    welcomeOverlay: {
      position: "fixed" as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      height: "100vh",
      width: "100vw",
      background:
        "radial-gradient(circle at top left, rgba(76,29,149,0.7), transparent 55%), radial-gradient(circle at bottom right, rgba(8,47,73,0.9), transparent 55%), #020617",
      display: "flex",
      flexDirection: "column" as const,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
      overflowY: "auto" as const,
      overflowX: "hidden" as const,
      padding: "16px 20px",
      boxSizing: "border-box" as const,
    },

    welcomeCard: {
      background: "transparent",
      borderRadius: "0",
      padding: "0",
      boxShadow: "none",
      border: "none",
      maxWidth: "700px",
      width: "100%",
      textAlign: "center" as const,
      margin: "auto",
      boxSizing: "border-box" as const,
      display: "flex",
      flexDirection: "column" as const,
      gap: "10px",
      overflow: "visible" as const,
      maxHeight: "100%",
    },

    welcomeTitle: {
      fontSize: "22px",
      fontWeight: "700",
      color: colors.text,
      marginBottom: "6px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "8px",
    },

    welcomeSubtitle: {
      fontSize: "13px",
      color: colors.textSecondary,
      marginBottom: "14px",
      lineHeight: "1.4",
    },

    inputSection: {
      display: "flex",
      flexDirection: "column" as const,
      gap: "24px",
      marginBottom: "32px",
    },

    inputGroup: {
      display: "flex",
      flexDirection: "column" as const,
      gap: "8px",
      textAlign: "left" as const,
    },

    label: {
      fontSize: "14px",
      fontWeight: "600",
      color: colors.text,
    },

    input: {
      padding: "16px",
      border: `2px solid ${colors.border}`,
      borderRadius: "12px",
      fontSize: "16px",
      backgroundColor: colors.surfaceWarm,
      color: colors.text,
      transition: "all 0.2s ease",
      outline: "none",
    },

    primaryButton: {
      padding: "16px 32px",
      backgroundColor: colors.primary,
      border: "none",
      borderRadius: "12px",
      color: "white",
      fontSize: "16px",
      fontWeight: "600",
      cursor: "pointer",
      transition: "all 0.2s ease",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "8px",
    },

    secondaryButton: {
      padding: "10px 20px",
      backgroundColor: colors.surfaceWarm,
      border: `2px solid ${colors.border}`,
      borderRadius: "10px",
      color: colors.text,
      fontSize: "13px",
      fontWeight: "500",
      cursor: "pointer",
      transition: "all 0.2s ease",
    },

    orDivider: {
      display: "flex",
      alignItems: "center",
      gap: "16px",
      margin: "20px 0",
      color: colors.textMuted,
      fontSize: "14px",
      fontWeight: "500",
    },

    orLine: {
      flex: 1,
      height: "1px",
      backgroundColor: colors.border,
    },

    // Main layout (when project is loaded)
    mainLayout: {
      display: "flex",
      flex: 1,
      overflow: "hidden",
    },

    // Left side - Knowledge Graph (70% width)
    leftPanel: {
      flex: "0 0 70%",
      background:
        "radial-gradient(circle at top left, rgba(55,65,81,0.7), transparent 60%), #020617",
      borderRight: `1px solid ${colors.borderLight}`,
      overflow: "hidden",
    },

    // Right side - Chat (30% width)
    rightPanel: {
      flex: "0 0 30%",
      background:
        "radial-gradient(circle at top right, rgba(30,64,175,0.7), transparent 60%), #020617",
      overflow: "hidden",
    },

    // Error and progress styles
    errorBanner: {
      backgroundColor: "#FEF2F2",
      border: `1px solid #FECACA`,
      color: colors.error,
      padding: "16px",
      borderRadius: "12px",
      margin: "16px 0",
      fontSize: "14px",
    },

    progressBanner: {
      backgroundColor: "#FEF3C7",
      border: `1px solid ${colors.border}`,
      color: colors.secondary,
      padding: "16px",
      borderRadius: "12px",
      margin: "16px 0",
      fontSize: "14px",
      display: "flex",
      alignItems: "center",
      gap: "12px",
    },

    spinner: {
      width: "20px",
      height: "20px",
      border: `2px solid ${colors.border}`,
      borderTop: `2px solid ${colors.primary}`,
      borderRadius: "50%",
      animation: "spin 1s linear infinite",
    },
  };

  const renderWelcomeScreen = () => (
    <div style={styles.welcomeOverlay}>
      <div style={styles.welcomeCard}>
        <div
          style={{ ...styles.welcomeTitle }}
          className="welcome-title-responsive"
        >
          <span>🔍</span>
          <span>EulonAI</span>
        </div>
        <div
          style={{ ...styles.welcomeSubtitle }}
          className="welcome-subtitle-responsive"
        >
          Transform your codebase into an interactive knowledge graph
        </div>

        {state.error && <div style={styles.errorBanner}>{state.error}</div>}

        {state.isProcessing && (
          <div style={styles.progressBanner}>
            <div style={styles.spinner}></div>
            <div style={{ flex: 1 }}>
              {loadingStage && (
                <div style={{ fontSize: "12px", fontWeight: "600", marginBottom: "4px", color: colors.primary }}>
                  {loadingStage}
                </div>
              )}
              <div>{state.progress}</div>
              {loadingProgress !== undefined && (
                <div style={{ marginTop: "8px", width: "100%", height: "4px", backgroundColor: colors.border, borderRadius: "2px", overflow: "hidden" }}>
                  <div style={{ width: `${loadingProgress}%`, height: "100%", backgroundColor: colors.primary, transition: "width 0.3s ease" }} />
                </div>
              )}
            </div>
          </div>
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            width: "100%",
            maxWidth: "600px",
            margin: "0 auto",
          }}
        >
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
            style={styles.secondaryButton}
            className="button-responsive"
          >
            Import from GitHub
          </button>

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
          style={{ ...styles.secondaryButton, marginTop: "6px" }}
          className="button-responsive"
        >
          ⚙️ Settings
        </button>
      </div>
    </div>
  );

  const renderMainInterface = () => {
    // Double-check graph validity before rendering
    if (!isGraphValid) {
      console.warn(
        "Attempted to render main interface with invalid graph:",
        state.graph
      );
      return renderWelcomeScreen();
    }

    return (
      <>
        {/* Top Navbar */}
        <div style={styles.navbar} className="navbar-responsive">
          <div
            style={styles.navbarContent}
            className="navbar-content-responsive"
          >
            <span>🔍 EulonAI</span>
            <span>•</span>
            <span>{state.graph?.nodes.length || 0} nodes</span>
            <span>•</span>
            <span>{state.graph?.relationships.length || 0} relationships</span>
            <span>•</span>
            <span>{state.fileContents?.size || 0} files</span>
          </div>
          <div
            style={{
              position: "absolute",
              right: "24px",
              display: "flex",
              gap: "12px",
            }}
            className="navbar-buttons-responsive"
          >
            <button
              onClick={async () => {
                updateState({ showHistory: true });
                
                // Determine repo info - use currentRepoInfo or extract from githubUrl
                let repoInfo = currentRepoInfo;
                
                if (!repoInfo && state.githubUrl) {
                  // Try to extract repo info from githubUrl if available
                  const urlMatch = state.githubUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
                  if (urlMatch) {
                    const [, owner, repo] = urlMatch;
                    repoInfo = { owner, repo };
                    setCurrentRepoInfo(repoInfo);
                    console.log(`📦 Extracted repo info from URL: ${owner}/${repo}`);
                  }
                }
                
                // If we have repo info but no commit timeline, fetch it
                if (repoInfo && !commitTimeline && !historyLoading) {
                  try {
                    console.log(`📜 Fetching commit history for ${repoInfo.owner}/${repoInfo.repo}...`);
                    console.log(`🔑 GitHub token available: ${githubToken ? 'YES' : 'NO'}`);
                    
                    setLoadingStage("Fetching History");
                    setLoadingProgress(50);
                    
                    await fetchCommitHistory(
                      repoInfo.owner,
                      repoInfo.repo,
                      { maxCommits: 100 }
                    );
                    
                    setLoadingStage("");
                    setLoadingProgress(undefined);
                    console.log(`✅ Successfully fetched commit history`);
                  } catch (error) {
                    console.error("❌ Failed to fetch commit history:", error);
                    setLoadingStage("");
                    setLoadingProgress(undefined);
                    // Error is already handled by useCommitHistory hook and displayed in the modal
                  }
                } else if (!repoInfo) {
                  console.warn("⚠️ No repository info available. Cannot fetch commit history.");
                }
              }}
              style={{
                ...styles.navbarButton,
                backgroundColor: colors.surfaceWarm,
                color: colors.text,
              }}
              className="navbar-button-responsive"
            >
              <span>🕒</span>
              History
            </button>
            <button
              onClick={() => updateState({ showStats: !state.showStats })}
              style={{
                ...styles.navbarButton,
                backgroundColor: state.showStats
                  ? colors.primary
                  : colors.surfaceWarm,
                color: state.showStats ? "#fff" : colors.text,
              }}
              className="navbar-button-responsive"
            >
              <span>📊</span>
              Stats
            </button>
            <button
              onClick={handleDownloadGraph}
              style={{
                ...styles.navbarButton,
                backgroundColor: state.graph ? colors.primary : colors.border,
                color: state.graph ? "#fff" : colors.textMuted,
                cursor: state.graph ? "pointer" : "not-allowed",
                opacity: state.graph ? 1 : 0.6,
              }}
              disabled={!state.graph}
              className="navbar-button-responsive"
            >
              <span>📥</span>
              Download KG
            </button>
            <button
              onClick={handleNewProject}
              style={styles.navbarButton}
              className="navbar-button-responsive"
            >
              <span>🔄</span>
              New Project
            </button>
          </div>
        </div>

        {/* Statistics Panel */}
        {state.showStats && state.graph && (
          <div
            style={{
              backgroundColor: colors.surfaceWarm,
              borderBottom: `1px solid ${colors.borderLight}`,
              padding: "16px 24px",
              fontSize: "14px",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "24px",
              }}
              className="stats-grid-responsive"
            >
              {/* Node Statistics */}
              <div>
                <div
                  style={{
                    fontWeight: "600",
                    color: colors.text,
                    marginBottom: "8px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span>🔵</span>
                  Node Types
                </div>
                {(() => {
                  const nodeStats: Record<string, number> = {};
                  state.graph.nodes.forEach((node) => {
                    nodeStats[node.label] = (nodeStats[node.label] || 0) + 1;
                  });
                  return Object.entries(nodeStats)
                    .sort(([, a], [, b]) => b - a)
                    .map(([type, count]) => (
                      <div
                        key={type}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          color: colors.textSecondary,
                          marginBottom: "4px",
                        }}
                      >
                        <span>{type}:</span>
                        <span style={{ fontWeight: "500" }}>{count}</span>
                      </div>
                    ));
                })()}
              </div>

              {/* Relationship Statistics */}
              <div>
                <div
                  style={{
                    fontWeight: "600",
                    color: colors.text,
                    marginBottom: "8px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span>🔗</span>
                  Relationship Types
                </div>
                {(() => {
                  const relationshipStats: Record<string, number> = {};
                  state.graph.relationships.forEach((rel) => {
                    relationshipStats[rel.type] =
                      (relationshipStats[rel.type] || 0) + 1;
                  });
                  return Object.entries(relationshipStats)
                    .sort(([, a], [, b]) => b - a)
                    .map(([type, count]) => (
                      <div
                        key={type}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          color: colors.textSecondary,
                          marginBottom: "4px",
                        }}
                      >
                        <span>{type}:</span>
                        <span style={{ fontWeight: "500" }}>{count}</span>
                      </div>
                    ));
                })()}
              </div>

              {/* File Statistics */}
              <div>
                <div
                  style={{
                    fontWeight: "600",
                    color: colors.text,
                    marginBottom: "8px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span>📁</span>
                  File Info
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    color: colors.textSecondary,
                    marginBottom: "4px",
                  }}
                >
                  <span>Total Files:</span>
                  <span style={{ fontWeight: "500" }}>
                    {state.fileContents.size}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    color: colors.textSecondary,
                    marginBottom: "4px",
                  }}
                >
                  <span>Source Files:</span>
                  <span style={{ fontWeight: "500" }}>
                    {
                      Array.from(state.fileContents.keys()).filter(
                        (path) =>
                          path.endsWith(".py") ||
                          path.endsWith(".js") ||
                          path.endsWith(".ts") ||
                          path.endsWith(".tsx") ||
                          path.endsWith(".jsx")
                      ).length
                    }
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    color: colors.textSecondary,
                    marginBottom: "4px",
                  }}
                >
                  <span>Repository:</span>
                  <span
                    style={{
                      fontWeight: "500",
                      maxWidth: "120px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {state.githubUrl
                      ? state.githubUrl.split("/").slice(-2).join("/")
                      : "ZIP Upload"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Layout */}
        <div style={styles.mainLayout} className="main-layout-responsive">
          {/* Left Panel - Knowledge Graph */}
          <div style={styles.leftPanel} className="left-panel-responsive">
            <GraphExplorer
              graph={state.graph!}
              isLoading={state.isLoading}
              onNodeSelect={handleNodeSelect}
              fileContents={state.fileContents}
            />
          </div>

          {/* Right Panel - Chat */}
          <div style={styles.rightPanel} className="right-panel-responsive">
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
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  flexDirection: "column",
                  gap: "16px",
                  padding: "24px",
                  textAlign: "center",
                  color: colors.textMuted,
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
      </>
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
    } else if (message.includes("Extracting") || message.includes("Reading ZIP")) {
      stage = "Extracting";
    } else if (message.includes("Processing") || message.includes("Discovering")) {
      stage = "Processing";
    } else if (message.includes("Generating") || message.includes("Analyzing")) {
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
        message={state.progress || (loadingCommitSha ? "Processing commit..." : "Loading...")}
        stage={progressInfo?.stage || loadingStage || (loadingCommitSha ? "Analyzing Commit" : undefined)}
        progress={progressInfo?.progress || loadingProgress}
        subMessage={progressInfo?.subMessage || (loadingCommitSha ? `Commit: ${loadingCommitSha.substring(0, 7)}` : undefined)}
        size="large"
      />
      
      <div style={styles.container}>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          
          #root {
            height: 100vh;
            width: 100vw;
          }
          
          input:focus, textarea:focus {
            border-color: ${colors.primary} !important;
            box-shadow: 0 0 0 3px ${colors.primary}20 !important;
          }
          
          button:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          }
          
          button:active:not(:disabled) {
            transform: translateY(0);
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
                borderRadius: "16px",
                padding: "32px",
                maxWidth: "600px",
                width: "90%",
                maxHeight: "80vh",
                overflow: "auto",
              }}
            >
              <h2
                style={{
                  color: colors.text,
                  marginBottom: "24px",
                  fontSize: "24px",
                  fontWeight: "700",
                }}
              >
                ⚙️ Settings
              </h2>

              {/* GitHub Token Section */}
              <div
                style={{
                  padding: "20px",
                  borderRadius: "12px",
                  backgroundColor: colors.surfaceWarm,
                  border: `1px solid ${colors.borderLight}`,
                  marginBottom: "24px",
                }}
              >
                <h3
                  style={{
                    color: colors.text,
                    marginBottom: "16px",
                    fontSize: "18px",
                    fontWeight: "600",
                  }}
                >
                  🔑 GitHub Configuration
                </h3>

                <div style={styles.inputGroup}>
                  <label style={styles.label}>
                    GitHub Personal Access Token (Optional)
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
                      fontSize: "12px",
                      color: colors.textMuted,
                      marginTop: "4px",
                    }}
                  >
                    Increases rate limit from 60 to 5,000 requests/hour.
                    Generate at:
                    <a
                      href="https://github.com/settings/tokens"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: colors.primary,
                        textDecoration: "none",
                        marginLeft: "4px",
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
                  padding: "20px",
                  borderRadius: "12px",
                  backgroundColor: colors.surfaceWarm,
                  border: `1px solid ${colors.borderLight}`,
                }}
              >
                <h3
                  style={{
                    color: colors.text,
                    marginBottom: "16px",
                    fontSize: "18px",
                    fontWeight: "600",
                  }}
                >
                  🤖 LLM Configuration
                </h3>

                {/* Provider Selection */}
                <div style={styles.inputGroup}>
                  <label style={styles.label}>LLM Provider</label>
                  <select
                    value={settings.llmProvider}
                    onChange={(e) =>
                      updateSetting(
                        "llmProvider",
                        e.target.value as LLMProvider
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
                          fontSize: "12px",
                          color: colors.textMuted,
                          marginTop: "4px",
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
                            e.target.value
                          )
                        }
                        placeholder="gpt-4o-mini"
                        style={styles.input}
                      />
                      <div
                        style={{
                          fontSize: "12px",
                          color: colors.textMuted,
                          marginTop: "4px",
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
                          fontSize: "12px",
                          color: colors.textMuted,
                          marginTop: "4px",
                        }}
                      >
                        Azure OpenAI API version (e.g., 2024-02-01,
                        2025-01-01-preview)
                      </div>
                    </div>
                  </>
                )}

                {/* Configuration Status */}
                <div
                  style={{
                    padding: "16px",
                    borderRadius: "8px",
                    backgroundColor: isApiKeyValid ? "#F0F9F0" : "#FFF5F5",
                    border: `1px solid ${
                      isApiKeyValid ? "#C6F6C6" : "#FED7D7"
                    }`,
                    marginTop: "16px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "14px",
                      fontWeight: "500",
                      color: isApiKeyValid ? "#2F855A" : "#C53030",
                    }}
                  >
                    <span>{isApiKeyValid ? "✅" : "❌"}</span>
                    {isApiKeyValid
                      ? "Configuration Valid"
                      : "Configuration Invalid"}
                  </div>
                  {!isApiKeyValid && (
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#C53030",
                        marginTop: "4px",
                      }}
                    >
                      {settings.llmProvider === "azure-openai"
                        ? "Please provide API key, endpoint, and deployment name"
                        : "Please provide a valid API key"}
                    </div>
                  )}
                </div>

                {/* Provider Information */}
                <div
                  style={{
                    padding: "16px",
                    borderRadius: "8px",
                    backgroundColor: colors.background,
                    border: `1px solid ${colors.borderLight}`,
                    marginTop: "16px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: "600",
                      color: colors.text,
                      marginBottom: "8px",
                    }}
                  >
                    📋 Provider Information
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: colors.textMuted,
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

              <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
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
                <button
                  onClick={() => updateState({ showSettings: false })}
                  style={styles.secondaryButton}
                >
                  Cancel
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
                border: `1px solid ${colors.borderLight}`,
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
                    padding: "40px",
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
                    padding: "40px",
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
                          await fetchCommitHistory(
                            currentRepoInfo.owner,
                            currentRepoInfo.repo,
                            { maxCommits: 100 }
                          );
                          setLoadingStage("");
                          setLoadingProgress(undefined);
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
                    padding: "40px",
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
                  <p>Fetching commits from {currentRepoInfo.owner}/{currentRepoInfo.repo}</p>
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
                      gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
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
                    padding: "40px",
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
                    Unable to load commit history for{" "}
                    {currentRepoInfo.owner}/{currentRepoInfo.repo}. Make sure
                    you have access to this repository.
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

        {/* Responsive styles */}
        <style>{`
          /* Base styles for desktop */
          * {
            box-sizing: border-box;
          }

          html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            overflow-x: hidden;
          }

          /* Welcome screen - allow scrolling if content exceeds viewport */
          .welcome-overlay-desktop {
            overflow-y: auto !important;
            overflow-x: hidden !important;
          }

          /* Mobile styles */
          @media (max-width: 768px) {
            /* Welcome screen mobile adjustments */
            .welcome-overlay-mobile {
              padding: 20px 16px !important;
            }

            /* Main layout - stack panels vertically */
            .main-layout-responsive {
              flex-direction: column !important;
            }

            .left-panel-responsive {
              flex: 0 0 60% !important;
              min-height: 400px;
            }

            .right-panel-responsive {
              flex: 0 0 40% !important;
              min-height: 300px;
            }

            /* Navbar responsive */
            .navbar-responsive {
              padding: 8px 16px !important;
              flex-wrap: wrap;
            }

            .navbar-content-responsive {
              font-size: 12px !important;
              gap: 8px !important;
              flex-wrap: wrap;
            }

            .navbar-buttons-responsive {
              position: static !important;
              margin-top: 8px;
              width: 100%;
              justify-content: center;
            }

            .navbar-button-responsive {
              padding: 6px 12px !important;
              font-size: 12px !important;
            }

            /* Welcome title responsive */
            .welcome-title-responsive {
              font-size: 24px !important;
              gap: 8px !important;
            }

            .welcome-subtitle-responsive {
              font-size: 16px !important;
              margin-bottom: 24px !important;
            }

            /* Buttons responsive */
            .button-responsive {
              padding: 12px 20px !important;
              font-size: 14px !important;
            }

            /* Stats panel responsive */
            .stats-grid-responsive {
              grid-template-columns: 1fr !important;
              gap: 16px !important;
            }
          }

          /* Small mobile styles */
          @media (max-width: 480px) {
            .welcome-card-mobile {
              padding: 20px !important;
              border-radius: 12px !important;
            }

            .welcome-title-responsive {
              font-size: 20px !important;
            }

            .welcome-subtitle-responsive {
              font-size: 14px !important;
              margin-bottom: 20px !important;
            }

            .button-responsive {
              padding: 10px 16px !important;
              font-size: 13px !important;
            }

            .navbar-content-responsive {
              font-size: 11px !important;
            }
          }

          /* Tablet styles */
          @media (min-width: 769px) and (max-width: 1024px) {
            .left-panel-responsive {
              flex: 0 0 65% !important;
            }

            .right-panel-responsive {
              flex: 0 0 35% !important;
            }
          }
        `}</style>
      </div>
    </ErrorBoundary>
  );
};

export default HomePage;
