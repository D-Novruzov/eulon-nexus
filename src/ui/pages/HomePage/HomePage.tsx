// @ts-nocheck
import React, { useState } from "react";
import ErrorBoundary from "../../components/ErrorBoundary";
import { GraphExplorer } from "../../components/graph";
import { ChatInterface } from "../../components/chat";
import ExportFormatModal from "../../components/ExportFormatModal";
import WarningDialog from "../../components/WarningDialog";
// Engine components removed - using simplified parsing mode toggle
import RepositoryInput from "../../components/repository/RepositoryInput";
import { useGitNexus } from "../../hooks/useGitNexus";
import {
  exportAndDownloadGraph,
  exportAndDownloadGraphAsCSV,
} from "../../../lib/export";
import type { ExportFormat } from "../../components/ExportFormatModal";
import GitHubConnectCard from "../../components/github/GitHubConnectCard";
import GitHubRepoPicker from "../../components/github/GitHubRepoPicker";

/**
 * HomePage - Simplified and focused main application page
 * Uses custom hooks and focused components for better maintainability
 */
const HomePage: React.FC = () => {
  const [showNewAnalysisWarning, setShowNewAnalysisWarning] = useState(false);
  const [isGitHubConnected, setIsGitHubConnected] = useState(false);
  const [showGitHubRepoPicker, setShowGitHubRepoPicker] = useState(false);
  const [githubImportMessage, setGitHubImportMessage] = useState<string | null>(
    null
  );
  const {
    state,
    processing,
    settings,
    handleNodeSelect,
    handleZipProcess,
    toggleStats,
    toggleExportModal,
    setShowWelcome,
  } = useGitNexus();

  // Engine change handler removed - parsing mode controlled via .env

  const handleExport = async (format: ExportFormat) => {
    if (!state.graph) return;

    try {
      const projectName = "project"; // You can customize this
      if (format === "json") {
        await exportAndDownloadGraph(
          state.graph,
          { projectName },
          state.fileContents
        );
      } else if (format === "csv") {
        await exportAndDownloadGraphAsCSV(state.graph, { projectName });
      }
      toggleExportModal();
    } catch (error) {
      console.error("Export failed:", error);
      alert("Export failed. Please try again.");
    }
  };

  const handleClearResults = () => {
    // Show warning dialog if there's existing data
    if (
      state.graph &&
      (state.graph.nodes.length > 0 || state.graph.relationships.length > 0)
    ) {
      setShowNewAnalysisWarning(true);
    } else {
      // No data to lose, proceed directly
      performNewAnalysis();
    }
  };

  const performNewAnalysis = () => {
    processing.clearResult();
    setShowWelcome(true);
    setShowNewAnalysisWarning(false);
  };

  const cancelNewAnalysis = () => {
    setShowNewAnalysisWarning(false);
  };

  // Show welcome screen if no graph and not processing
  if (state.showWelcome && !state.graph && !processing.state.isProcessing) {
    return (
      <div className="app">
        <header className="app-header">
          <h1>🌐 EulonAI</h1>
          <p>Analyze and explore your codebase as a knowledge graph</p>
        </header>

        <main className="welcome-content">
          <div className="welcome-intro">
            <h2>Welcome to EulonAI</h2>
            <p>
              Transform your code repository into an interactive knowledge
              graph. Analyze dependencies, explore relationships, and gain deep
              insights into your codebase structure.
            </p>
          </div>

          <div className="welcome-grid">
            <div className="welcome-column">
              <GitHubConnectCard
                onConnected={() => {
                  setIsGitHubConnected(true);
                }}
              />
              {isGitHubConnected && (
                <div className="github-import-actions">
                  <button
                    className="github-open-picker-button"
                    onClick={() => setShowGitHubRepoPicker(true)}
                    disabled={processing.state.isProcessing}
                  >
                    Import from GitHub
                  </button>
                  {githubImportMessage && (
                    <div className="github-import-message">
                      {githubImportMessage}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="welcome-column">
              <RepositoryInput
                onZipFileSubmit={handleZipProcess}
                disabled={processing.state.isProcessing}
              />
            </div>
          </div>

          {/* Engine selector removed - parsing mode controlled via .env */}

          {/* Engine capabilities and performance panels removed - simplified architecture */}
        </main>

        <style>{`
          .app {
            min-height: 100vh;
            background: linear-gradient(135deg, #ff9a56 0%, #ffad56 50%, #ffc947 100%);
            padding: 2rem;
          }
          
          .app-header {
            text-align: center;
            color: white;
            margin-bottom: 3rem;
          }
          
          .app-header h1 {
            font-size: 2.5rem;
            margin-bottom: 0.5rem;
            font-weight: 300;
          }
          
          .app-header p {
            font-size: 1.1rem;
            opacity: 0.9;
            margin: 0;
          }
          
          .welcome-content {
            max-width: 960px;
            margin: 0 auto;
            background: radial-gradient(circle at top left, rgba(79,70,229,0.35), transparent),
                        radial-gradient(circle at bottom right, rgba(34,197,94,0.25), transparent),
                        #020617;
            border-radius: 12px;
            padding: 2.5rem;
            box-shadow: 0 22px 55px rgba(15,23,42,0.9);
          }
          
          .welcome-intro {
            text-align: center;
            margin-bottom: 2rem;
          }
          
          .welcome-intro h2 {
            color: #e5e7eb;
            font-size: 1.8rem;
            margin-bottom: 1rem;
            font-weight: 400;
          }
          
          .welcome-intro p {
            color: #9ca3af;
            font-size: 1rem;
            line-height: 1.6;
            margin: 0;
          }
          
          .engine-info-panel {
            margin-top: 2rem;
            padding: 1rem;
            background: #f8f9fa;
            border-radius: 8px;
          }
          
          .capabilities-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1rem;
            margin-top: 1rem;
          }
          
          .capability-item {
            padding: 1rem;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            background: white;
          }
          
          .capability-item.active {
            border-color: #007bff;
            background: #e7f3ff;
          }
          
          .capability-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.5rem;
          }
          
          .capability-name {
            font-weight: 600;
          }
          
          .capability-list {
            display: flex;
            flex-wrap: wrap;
            gap: 0.25rem;
          }
          
          .capability-tag {
            font-size: 0.7rem;
            padding: 0.2rem 0.4rem;
            background: #e9ecef;
            border-radius: 12px;
            color: #495057;
          }
          
          .performance-panel {
            margin-top: 2rem;
            padding: 1rem;
            background: #f0f8ff;
            border-radius: 8px;
            border: 1px solid #b3d9ff;
          }
          
          .performance-stats {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 1rem;
            margin-top: 1rem;
          }
          
          .stat-item {
            text-align: center;
            padding: 0.5rem;
            background: white;
            border-radius: 4px;
          }
          
          .stat-item.highlight {
            background: #e8f5e8;
            border: 1px solid #66bb6a;
          }
          
          .stat-label {
            display: block;
            font-size: 0.8rem;
            color: #666;
          }
          
          .stat-value {
            display: block;
            font-size: 1.2rem;
            font-weight: 600;
            color: #333;
          }

          .welcome-grid {
            margin-top: 2rem;
            display: grid;
            grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.2fr);
            gap: 1.5rem;
          }

          .welcome-column {
            min-width: 0;
          }

          .github-import-actions {
            margin-top: 1rem;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
          }

          .github-open-picker-button {
            padding: 0.55rem 1rem;
            border-radius: 999px;
            border: none;
            background: linear-gradient(135deg, #6366f1, #22d3ee);
            color: #f9fafb;
            font-weight: 600;
            font-size: 0.9rem;
            cursor: pointer;
            box-shadow: 0 16px 40px rgba(59, 130, 246, 0.7);
          }

          .github-open-picker-button:disabled {
            opacity: 0.6;
            cursor: default;
            box-shadow: none;
          }

          .github-import-message {
            font-size: 0.85rem;
            color: #bbf7d0;
          }
        `}</style>
      </div>
    );
  }

  // Main application interface
  return (
    <ErrorBoundary>
      <div className="app">
        <header className="app-header">
          <div className="header-content">
            <h1>🌐 EulonAI</h1>
            <div className="header-actions">
              <button onClick={handleClearResults} className="clear-button">
                🏠 New Analysis
              </button>
              <button
                onClick={settings.showSettings}
                className="settings-button"
              >
                ⚙️ Settings
              </button>
            </div>
          </div>
        </header>

        <div className="main-layout">
          <aside className="sidebar">
            {/* Engine components removed - simplified processing status */}
            {processing.state.isProcessing && (
              <div className="processing-status">
                <div className="processing-indicator">⚡ Processing...</div>
                {processing.state.progress && (
                  <div className="progress-text">
                    {processing.state.progress}
                  </div>
                )}
              </div>
            )}

            {processing.state.error && (
              <div className="error-message">
                <strong>Error:</strong> {processing.state.error}
              </div>
            )}

            {processing.state.result && (
              <div className="processing-results">
                <div className="result-stats">
                  <span>
                    📊 {processing.state.result.graph.nodes.length} nodes
                  </span>
                  <span>
                    🔗 {processing.state.result.graph.relationships.length}{" "}
                    relationships
                  </span>
                </div>
              </div>
            )}

            {state.graph && (
              <div className="graph-actions">
                <button onClick={toggleStats} className="action-button">
                  📊 {state.showStats ? "Hide" : "Show"} Stats
                </button>
                <button onClick={toggleExportModal} className="action-button">
                  💾 Export Graph
                </button>
              </div>
            )}

            {state.graph && (
              <div className="chat-container">
                <ChatInterface
                  graph={state.graph}
                  fileContents={state.fileContents}
                />
              </div>
            )}
          </aside>

          <main className="main-content">
            {state.graph && (
              <GraphExplorer
                graph={state.graph}
                fileContents={state.fileContents}
                onNodeSelect={handleNodeSelect}
                isLoading={processing.state.isProcessing}
              />
            )}
          </main>
        </div>

        {state.showExportModal && state.graph && (
          <ExportFormatModal
            isOpen={state.showExportModal}
            onSelectFormat={handleExport}
            onClose={toggleExportModal}
            projectName="project"
          />
        )}

        <style>{`
          .app {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            background: #f8f9fa;
          }
          
          .app-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 1rem 2rem;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          
          .header-content {
            display: flex;
            justify-content: space-between;
            align-items: center;
            max-width: 1400px;
            margin: 0 auto;
          }
          
          .header-content h1 {
            margin: 0;
            font-size: 1.8rem;
          }
          
          .header-actions {
            display: flex;
            gap: 0.5rem;
          }
          
          .clear-button, .settings-button {
            padding: 0.5rem 1rem;
            background: rgba(255,255,255,0.2);
            border: 1px solid rgba(255,255,255,0.3);
            border-radius: 4px;
            color: white;
            cursor: pointer;
            font-size: 0.9rem;
            transition: background 0.2s ease;
          }
          
          .clear-button:hover, .settings-button:hover {
            background: rgba(255,255,255,0.3);
          }
          
          .main-layout {
            flex: 1;
            display: grid;
            grid-template-columns: 400px 1fr;
            gap: 1rem;
            padding: 1rem;
            max-width: none;
            margin: 0;
            width: 100%;
            height: calc(100vh - 80px);
          }
          
          .sidebar {
            background: white;
            border-radius: 8px;
            padding: 1rem;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            display: flex;
            flex-direction: column;
            overflow: hidden;
          }
          
          .main-content {
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          
          .chat-container {
            flex: 1;
            margin-top: 1rem;
            overflow: hidden;
            border-radius: 4px;
            border: 1px solid #e0e0e0;
          }
          
          .graph-actions {
            margin-top: 1rem;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
          }
          
          .action-button {
            padding: 0.5rem;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.9rem;
            transition: background 0.2s ease;
          }
          
          .action-button:hover {
            background: #0056b3;
          }
          
          @media (max-width: 1200px) {
            .main-layout {
              grid-template-columns: 1fr;
              grid-template-rows: auto 1fr;
              height: auto;
            }
            
            .chat-container {
              height: 400px;
            }
          }
        `}</style>

        {/* New Analysis Warning Dialog */}
        <WarningDialog
          isOpen={showNewAnalysisWarning}
          title="Start New Analysis"
          message="Starting a new analysis will permanently delete your current knowledge graph and all analyzed data. This action cannot be undone. Are you sure you want to continue?

Chill though - you can always re-upload your previous ZIP file if you change your mind. It only takes a few seconds! 🚀"
          confirmText="Yes, Start New Analysis"
          cancelText="Cancel"
          variant="warning"
          onConfirm={performNewAnalysis}
          onCancel={cancelNewAnalysis}
        />
        <GitHubRepoPicker
          isOpen={showGitHubRepoPicker}
          onClose={() => setShowGitHubRepoPicker(false)}
          onImport={async (repos) => {
            for (const repo of repos) {
              const url = `https://github.com/${repo.owner}/${repo.name}`;
              await processing.processGitHubRepo(url);
            }
            setGitHubImportMessage(
              "Repository successfully added to your knowledge graph"
            );
          }}
        />
      </div>
    </ErrorBoundary>
  );
};

export default HomePage;
