import React, { useState, useCallback, useEffect } from 'react';
import ErrorBoundary from '../components/ErrorBoundary.tsx';
import { GraphExplorer } from '../components/graph/index.ts';
import { ChatInterface } from '../components/chat/index.ts';
import WarningDialog from '../components/WarningDialog.tsx';
import ExportFormatModal from '../components/ExportFormatModal.tsx';
import RepositoryInput from '../components/repository/RepositoryInput.tsx';
import type { KnowledgeGraph } from '../../core/graph/types.ts';
import { IngestionService } from '../../services/ingestion.service.ts';
import { LLMService, type LLMProvider } from '../../ai/llm-service.ts';
import { exportAndDownloadGraph, exportAndDownloadGraphAsCSV } from '../../lib/export.ts';
import type { ExportFormat } from '../components/ExportFormatModal.tsx';
import { useSettings } from '../hooks/useSettings.ts';

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
  directoryFilter: 'src,lib,components,pages,utils',
  fileExtensions: '.ts,.tsx,.js,.jsx,.py,.java,.cpp,.c,.cs,.php,.rb,.go,.rs,.swift,.kt,.scala,.clj,.hs,.ml,.fs,.elm,.dart,.lua,.r,.m,.sh,.sql,.html,.css,.scss,.less,.vue,.svelte',
  githubUrl: '',
  githubToken: localStorage.getItem('github_token') || '',
  isProcessing: false,
  progress: '',
  error: '',
  showSettings: false
};

const HomePage: React.FC = () => {
  const [state, setState] = useState<AppState>(initialState);
  const [showNewProjectWarning, setShowNewProjectWarning] = useState(false);
  const [services] = useState(() => ({
    ingestion: new IngestionService(),
    llm: new LLMService()
  }));
  
  // Use settings hook for LLM configuration
  const { settings, updateSetting, getCurrentProviderApiKey, updateCurrentProviderApiKey } = useSettings();

  const updateState = useCallback((updates: Partial<AppState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const handleNodeSelect = (nodeId: string | null) => {
    updateState({ selectedNodeId: nodeId });
  };

  // Save GitHub token to localStorage
  useEffect(() => {
    if (state.githubToken) {
      localStorage.setItem('github_token', state.githubToken);
    }
  }, [state.githubToken]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !file.name.endsWith('.zip')) {
      updateState({ error: 'Please select a valid ZIP file' });
      return;
    }

    try {
      updateState({ 
        isProcessing: true, 
        error: '', 
        progress: 'Reading ZIP file...',
        showWelcome: false
      });

      console.log('Starting ZIP processing...', file.name);

      const result = await services.ingestion.processZipFile(file, {
        directoryFilter: state.directoryFilter,
        fileExtensions: state.fileExtensions
      });

      console.log('ZIP processing completed:', {
        nodeCount: result.graph?.nodes?.length || 0,
        relationshipCount: result.graph?.relationships?.length || 0,
        fileCount: result.fileContents?.size || 0
      });

      updateState({
        graph: result.graph,
        fileContents: result.fileContents,
        isProcessing: false,
        progress: '',
        showWelcome: false // Ensure we stay in main interface
      });
    } catch (error) {
      console.error('ZIP processing error:', error);
      updateState({
        error: error instanceof Error ? error.message : 'Failed to process ZIP file',
        isProcessing: false,
        progress: '',
        showWelcome: true // Return to welcome screen on error
      });
    }
  };


  const handleNewProject = () => {
    // Show warning dialog if there's existing data
    if (state.graph && (state.graph.nodes.length > 0 || state.graph.relationships.length > 0)) {
      setShowNewProjectWarning(true);
    } else {
      // No data to lose, proceed directly
      performNewProject();
    }
  };

  const performNewProject = () => {
    updateState({
      ...initialState,
      showStats: false
    });
    setShowNewProjectWarning(false);
  };

  const cancelNewProject = () => {
    setShowNewProjectWarning(false);
  };

  const handleDownloadGraph = () => {
    if (!state.graph) {
      alert('No knowledge graph to download. Please process a repository first.');
      return;
    }

    // Show the export format modal
    updateState({ showExportModal: true });
  };

  const handleExportFormatSelect = (format: ExportFormat) => {
    try {
      const projectName = state.githubUrl 
        ? state.githubUrl.split('/').pop()?.replace('.git', '') || 'repository'
        : 'project';

      if (format === 'csv') {
        exportAndDownloadGraphAsCSV(
          state.graph!,
          { 
            projectName,
            includeTimestamp: true
          }
        );
        console.log('Knowledge graph exported as CSV successfully');
      } else {
        exportAndDownloadGraph(
          state.graph!,
          { 
            projectName,
            includeTimestamp: true,
            prettyPrint: true,
            includeMetadata: true
          },
          state.fileContents
        );
        console.log('Knowledge graph exported as JSON successfully');
      }
    } catch (error) {
      console.error('Failed to export graph:', error);
      alert('Failed to export knowledge graph. Please try again.');
    }
  };

  const handleCloseExportModal = () => {
    updateState({ showExportModal: false });
  };

  const isApiKeyValid = (() => {
    const currentApiKey = getCurrentProviderApiKey();
    if (settings.llmProvider === 'azure-openai') {
      // For Azure OpenAI, we need to validate all required fields
      return services.llm.validateApiKey(settings.llmProvider, currentApiKey) &&
             settings.azureOpenAIEndpoint.trim() !== '' &&
             settings.azureOpenAIDeploymentName.trim() !== '';
    }
    return services.llm.validateApiKey(settings.llmProvider, currentApiKey);
  })();
  const isGraphValid = state.graph && state.graph.nodes && Array.isArray(state.graph.nodes) && state.graph.relationships && Array.isArray(state.graph.relationships);

  // Orange-Yellow tone color palette
  const colors = {
    background: '#FDF6E3', // Warm cream
    surface: '#FFFFFF',
    surfaceWarm: '#FFF8F0', // Warm white with orange tint
    primary: '#ff9a56', // Orange
    primaryLight: '#ffad56', // Light orange
    secondary: '#ffc947', // Yellow
    accent: '#ff8c42', // Bright orange
    text: '#8B4513', // Saddle brown
    textSecondary: '#A0522D', // Sienna
    textMuted: '#CD853F', // Peru
    border: '#FFD4A3', // Light orange
    borderLight: '#FFF2E6', // Very light orange
    success: '#32CD32', // Lime green
    warning: '#ff9a56', // Orange
    error: '#FF6347' // Tomato red
  };

  // Modern styles with warm theme
  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column' as const,
      height: '100vh',
      width: '100vw',
      backgroundColor: colors.background,
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      overflow: 'hidden'
    },

    // Top navbar (only visible when project is loaded)
    navbar: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '12px 24px',
      background: colors.background,
      borderBottom: `1px solid ${colors.borderLight}`,
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      position: 'relative' as const
    },

    navbarContent: {
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      fontSize: '14px',
      fontWeight: '500',
      color: colors.text
    },

    navbarButton: {
      padding: '8px 16px',
      backgroundColor: colors.surfaceWarm,
      border: `1px solid ${colors.border}`,
      borderRadius: '8px',
      color: colors.text,
      fontSize: '14px',
      fontWeight: '500',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    },

    // Welcome screen (center overlay)
    welcomeOverlay: {
      position: 'fixed' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: colors.background,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    },

    welcomeCard: {
      backgroundColor: colors.surface,
      borderRadius: '20px',
      padding: '48px',
      boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
      border: `1px solid ${colors.borderLight}`,
      maxWidth: '600px',
      width: '90%',
      textAlign: 'center' as const
    },

    welcomeTitle: {
      fontSize: '32px',
      fontWeight: '700',
      color: colors.text,
      marginBottom: '16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px'
    },

    welcomeSubtitle: {
      fontSize: '18px',
      color: colors.textSecondary,
      marginBottom: '40px',
      lineHeight: '1.6'
    },

    inputSection: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '24px',
      marginBottom: '32px'
    },

    inputGroup: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '8px',
      textAlign: 'left' as const
    },

    label: {
      fontSize: '14px',
      fontWeight: '600',
      color: colors.text
    },

    input: {
      padding: '16px',
      border: `2px solid ${colors.border}`,
      borderRadius: '12px',
      fontSize: '16px',
      backgroundColor: colors.surfaceWarm,
      color: colors.text,
      transition: 'all 0.2s ease',
      outline: 'none'
    },

    primaryButton: {
      padding: '16px 32px',
      backgroundColor: colors.primary,
      border: 'none',
      borderRadius: '12px',
      color: 'white',
      fontSize: '16px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px'
    },

    secondaryButton: {
      padding: '12px 24px',
      backgroundColor: colors.surfaceWarm,
      border: `2px solid ${colors.border}`,
      borderRadius: '12px',
      color: colors.text,
      fontSize: '14px',
      fontWeight: '500',
      cursor: 'pointer',
      transition: 'all 0.2s ease'
    },

    orDivider: {
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      margin: '20px 0',
      color: colors.textMuted,
      fontSize: '14px',
      fontWeight: '500'
    },

    orLine: {
      flex: 1,
      height: '1px',
      backgroundColor: colors.border
    },

    // Main layout (when project is loaded)
    mainLayout: {
      display: 'flex',
      flex: 1,
      overflow: 'hidden'
    },

    // Left side - Knowledge Graph (70% width)
    leftPanel: {
      flex: '0 0 70%',
      backgroundColor: colors.surface,
      borderRight: `1px solid ${colors.borderLight}`,
      overflow: 'hidden'
    },

         // Right side - Chat (30% width)
     rightPanel: {
       flex: '0 0 30%',
       backgroundColor: colors.surfaceWarm,
       overflow: 'hidden'
     },

    // Error and progress styles
    errorBanner: {
      backgroundColor: '#FEF2F2',
      border: `1px solid #FECACA`,
      color: colors.error,
      padding: '16px',
      borderRadius: '12px',
      margin: '16px 0',
      fontSize: '14px'
    },

    progressBanner: {
      backgroundColor: '#FEF3C7',
      border: `1px solid ${colors.border}`,
      color: colors.secondary,
      padding: '16px',
      borderRadius: '12px',
      margin: '16px 0',
      fontSize: '14px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px'
    },

    spinner: {
      width: '20px',
      height: '20px',
      border: `2px solid ${colors.border}`,
      borderTop: `2px solid ${colors.primary}`,
      borderRadius: '50%',
      animation: 'spin 1s linear infinite'
    }
  };

  const renderWelcomeScreen = () => (
    <div style={styles.welcomeOverlay}>
      <div style={styles.welcomeCard}>
        <div style={styles.welcomeTitle}>
          <span>🔍</span>
          <span>GitNexus</span>
        </div>
        <div style={styles.welcomeSubtitle}>
          Transform your codebase into an interactive knowledge graph
        </div>

        {state.error && (
          <div style={styles.errorBanner}>
            {state.error}
          </div>
        )}

        {state.isProcessing && (
          <div style={styles.progressBanner}>
            <div style={styles.spinner}></div>
            {state.progress}
          </div>
        )}

        <RepositoryInput
          onZipFileSubmit={(file) => handleFileUpload({ target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>)}
          disabled={state.isProcessing}
        />

        <button
          onClick={() => updateState({ showSettings: true })}
          style={styles.secondaryButton}
        >
          ⚙️ Settings
        </button>
      </div>
    </div>
  );

  const renderMainInterface = () => {
    // Double-check graph validity before rendering
    if (!isGraphValid) {
      console.warn('Attempted to render main interface with invalid graph:', state.graph);
      return renderWelcomeScreen();
    }

    return (
      <>
        {/* Top Navbar */}
        <div style={styles.navbar}>
          <div style={styles.navbarContent}>
            <span>🔍 GitNexus</span>
            <span>•</span>
            <span>{state.graph?.nodes.length || 0} nodes</span>
            <span>•</span>
            <span>{state.graph?.relationships.length || 0} relationships</span>
            <span>•</span>
            <span>{state.fileContents?.size || 0} files</span>
          </div>
          <div style={{ position: 'absolute', right: '24px', display: 'flex', gap: '12px' }}>
            <button
              onClick={() => updateState({ showStats: !state.showStats })}
              style={{
                ...styles.navbarButton,
                backgroundColor: state.showStats ? colors.primary : colors.surfaceWarm,
                color: state.showStats ? '#fff' : colors.text
              }}
            >
              <span>📊</span>
              Stats
            </button>
            <button
              onClick={handleDownloadGraph}
              style={{
                ...styles.navbarButton,
                backgroundColor: state.graph ? colors.primary : colors.border,
                color: state.graph ? '#fff' : colors.textMuted,
                cursor: state.graph ? 'pointer' : 'not-allowed',
                opacity: state.graph ? 1 : 0.6
              }}
              disabled={!state.graph}
            >
              <span>📥</span>
              Download KG
            </button>
            <button
              onClick={handleNewProject}
              style={styles.navbarButton}
            >
              <span>🔄</span>
              New Project
            </button>
          </div>
        </div>

        {/* Statistics Panel */}
        {state.showStats && state.graph && (
          <div style={{
            backgroundColor: colors.surfaceWarm,
            borderBottom: `1px solid ${colors.borderLight}`,
            padding: '16px 24px',
            fontSize: '14px'
          }}>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
              gap: '24px' 
            }}>
              {/* Node Statistics */}
              <div>
                <div style={{ 
                  fontWeight: '600', 
                  color: colors.text, 
                  marginBottom: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span>🔵</span>
                  Node Types
                </div>
                {(() => {
                  const nodeStats: Record<string, number> = {};
                  state.graph.nodes.forEach(node => {
                    nodeStats[node.label] = (nodeStats[node.label] || 0) + 1;
                  });
                  return Object.entries(nodeStats)
                    .sort(([,a], [,b]) => b - a)
                    .map(([type, count]) => (
                      <div key={type} style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        color: colors.textSecondary,
                        marginBottom: '4px'
                      }}>
                        <span>{type}:</span>
                        <span style={{ fontWeight: '500' }}>{count}</span>
                      </div>
                    ));
                })()}
              </div>

              {/* Relationship Statistics */}
              <div>
                <div style={{ 
                  fontWeight: '600', 
                  color: colors.text, 
                  marginBottom: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span>🔗</span>
                  Relationship Types
                </div>
                {(() => {
                  const relationshipStats: Record<string, number> = {};
                  state.graph.relationships.forEach(rel => {
                    relationshipStats[rel.type] = (relationshipStats[rel.type] || 0) + 1;
                  });
                  return Object.entries(relationshipStats)
                    .sort(([,a], [,b]) => b - a)
                    .map(([type, count]) => (
                      <div key={type} style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        color: colors.textSecondary,
                        marginBottom: '4px'
                      }}>
                        <span>{type}:</span>
                        <span style={{ fontWeight: '500' }}>{count}</span>
                      </div>
                    ));
                })()}
              </div>

              {/* File Statistics */}
              <div>
                <div style={{ 
                  fontWeight: '600', 
                  color: colors.text, 
                  marginBottom: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span>📁</span>
                  File Info
                </div>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  color: colors.textSecondary,
                  marginBottom: '4px'
                }}>
                  <span>Total Files:</span>
                  <span style={{ fontWeight: '500' }}>{state.fileContents.size}</span>
                </div>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  color: colors.textSecondary,
                  marginBottom: '4px'
                }}>
                  <span>Source Files:</span>
                  <span style={{ fontWeight: '500' }}>
                    {Array.from(state.fileContents.keys()).filter(path => 
                      path.endsWith('.py') || path.endsWith('.js') || path.endsWith('.ts') || 
                      path.endsWith('.tsx') || path.endsWith('.jsx')
                    ).length}
                  </span>
                </div>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  color: colors.textSecondary,
                  marginBottom: '4px'
                }}>
                  <span>Repository:</span>
                  <span style={{ 
                    fontWeight: '500',
                    maxWidth: '120px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {state.githubUrl ? state.githubUrl.split('/').slice(-2).join('/') : 'ZIP Upload'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Layout */}
        <div style={styles.mainLayout}>
          {/* Left Panel - Knowledge Graph */}
          <div style={styles.leftPanel}>
            <GraphExplorer
              graph={state.graph!}
              isLoading={state.isLoading}
              onNodeSelect={handleNodeSelect}
              fileContents={state.fileContents}
            />
          </div>

                     {/* Right Panel - Chat */}
           <div style={styles.rightPanel}>
             {isApiKeyValid ? (
               <ChatInterface
                 graph={state.graph!}
                 fileContents={state.fileContents}
                 style={{ height: '100%' }}
               />
             ) : (
               <div style={{
                 display: 'flex',
                 alignItems: 'center',
                 justifyContent: 'center',
                 height: '100%',
                 flexDirection: 'column',
                 gap: '16px',
                 padding: '24px',
                 textAlign: 'center',
                 color: colors.textMuted
               }}>
                 <div style={{ fontSize: '48px', opacity: 0.3 }}>🔑</div>
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

  return (
    <ErrorBoundary>
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

        {state.showWelcome || !isGraphValid ? renderWelcomeScreen() : renderMainInterface()}

        {/* Settings Modal */}
        {state.showSettings && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              updateState({ showSettings: false });
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              updateState({ showSettings: false });
            }
          }}
          tabIndex={-1}
          >
            <div style={{
              backgroundColor: colors.surface,
              borderRadius: '16px',
              padding: '32px',
              maxWidth: '600px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto'
            }}>
              <h2 style={{ color: colors.text, marginBottom: '24px', fontSize: '24px', fontWeight: '700' }}>
                ⚙️ Settings
              </h2>
              
              {/* GitHub Token Section */}
              <div style={{
                padding: '20px',
                borderRadius: '12px',
                backgroundColor: colors.surfaceWarm,
                border: `1px solid ${colors.borderLight}`,
                marginBottom: '24px'
              }}>
                <h3 style={{ color: colors.text, marginBottom: '16px', fontSize: '18px', fontWeight: '600' }}>
                  🔑 GitHub Configuration
                </h3>
                
                <div style={styles.inputGroup}>
                  <label style={styles.label}>
                    GitHub Personal Access Token (Optional)
                  </label>
                  <input
                    type="password"
                    value={state.githubToken}
                    onChange={(e) => updateState({ githubToken: e.target.value })}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    style={styles.input}
                  />
                  <div style={{ fontSize: '12px', color: colors.textMuted, marginTop: '4px' }}>
                    Increases rate limit from 60 to 5,000 requests/hour. Generate at: 
                    <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" 
                       style={{ color: colors.primary, textDecoration: 'none', marginLeft: '4px' }}>
                      github.com/settings/tokens
                    </a>
                  </div>
                </div>
              </div>

              {/* LLM Configuration Section */}
              <div style={{
                padding: '20px',
                borderRadius: '12px',
                backgroundColor: colors.surfaceWarm,
                border: `1px solid ${colors.borderLight}`
              }}>
                <h3 style={{ color: colors.text, marginBottom: '16px', fontSize: '18px', fontWeight: '600' }}>
                  🤖 LLM Configuration
                </h3>
              
              {/* Provider Selection */}
              <div style={styles.inputGroup}>
                <label style={styles.label}>LLM Provider</label>
                <select
                  value={settings.llmProvider}
                  onChange={(e) => updateSetting('llmProvider', e.target.value as LLMProvider)}
                  style={{
                    ...styles.input,
                    cursor: 'pointer'
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
                  {settings.llmProvider === 'azure-openai' ? 'Azure OpenAI API Key' : 
                   settings.llmProvider === 'anthropic' ? 'Anthropic API Key' :
                   settings.llmProvider === 'gemini' ? 'Google API Key' : 'OpenAI API Key'}
                </label>
                <input
                  type="password"
                  value={getCurrentProviderApiKey()}
                  onChange={(e) => updateCurrentProviderApiKey(e.target.value)}
                  placeholder={
                    settings.llmProvider === 'azure-openai' ? 'Your Azure OpenAI key...' :
                    settings.llmProvider === 'anthropic' ? 'sk-ant-...' :
                    settings.llmProvider === 'gemini' ? 'Your Google API key...' : 'sk-...'
                  }
                  style={styles.input}
                />
              </div>

              {/* Azure OpenAI Specific Fields */}
              {settings.llmProvider === 'azure-openai' && (
                <>
                  <div style={styles.inputGroup}>
                    <label style={styles.label}>Azure OpenAI Endpoint</label>
                    <input
                      type="text"
                      value={settings.azureOpenAIEndpoint}
                      onChange={(e) => updateSetting('azureOpenAIEndpoint', e.target.value)}
                      placeholder="https://your-resource.openai.azure.com"
                      style={styles.input}
                    />
                    <div style={{ fontSize: '12px', color: colors.textMuted, marginTop: '4px' }}>
                      Your Azure OpenAI resource endpoint
                    </div>
                  </div>

                  <div style={styles.inputGroup}>
                    <label style={styles.label}>Deployment Name</label>
                    <input
                      type="text"
                      value={settings.azureOpenAIDeploymentName}
                      onChange={(e) => updateSetting('azureOpenAIDeploymentName', e.target.value)}
                      placeholder="gpt-4o-mini"
                      style={styles.input}
                    />
                    <div style={{ fontSize: '12px', color: colors.textMuted, marginTop: '4px' }}>
                      The deployment name you created in Azure OpenAI Studio
                    </div>
                  </div>

                  <div style={styles.inputGroup}>
                    <label style={styles.label}>API Version</label>
                    <input
                      type="text"
                      value={settings.azureOpenAIApiVersion}
                      onChange={(e) => updateSetting('azureOpenAIApiVersion', e.target.value)}
                      placeholder="2024-02-01"
                      style={styles.input}
                    />
                    <div style={{ fontSize: '12px', color: colors.textMuted, marginTop: '4px' }}>
                      Azure OpenAI API version (e.g., 2024-02-01, 2025-01-01-preview)
                    </div>
                  </div>
                </>
              )}

              {/* Configuration Status */}
              <div style={{
                padding: '16px',
                borderRadius: '8px',
                backgroundColor: isApiKeyValid ? '#F0F9F0' : '#FFF5F5',
                border: `1px solid ${isApiKeyValid ? '#C6F6C6' : '#FED7D7'}`,
                marginTop: '16px'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: isApiKeyValid ? '#2F855A' : '#C53030'
                }}>
                  <span>{isApiKeyValid ? '✅' : '❌'}</span>
                  {isApiKeyValid ? 'Configuration Valid' : 'Configuration Invalid'}
                </div>
                {!isApiKeyValid && (
                  <div style={{ fontSize: '12px', color: '#C53030', marginTop: '4px' }}>
                    {settings.llmProvider === 'azure-openai' 
                      ? 'Please provide API key, endpoint, and deployment name'
                      : 'Please provide a valid API key'}
                  </div>
                )}
              </div>

              {/* Provider Information */}
              <div style={{
                padding: '16px',
                borderRadius: '8px',
                backgroundColor: colors.background,
                border: `1px solid ${colors.borderLight}`,
                marginTop: '16px'
              }}>
                <div style={{ fontSize: '14px', fontWeight: '600', color: colors.text, marginBottom: '8px' }}>
                  📋 Provider Information
                </div>
                <div style={{ fontSize: '12px', color: colors.textMuted, lineHeight: '1.5' }}>
                  {settings.llmProvider === 'openai' && 'Direct OpenAI API. Get your API key from platform.openai.com'}
                  {settings.llmProvider === 'azure-openai' && 'Azure OpenAI Service. Requires Azure subscription and deployed model.'}
                  {settings.llmProvider === 'anthropic' && 'Anthropic Claude API. Get your API key from console.anthropic.com'}
                  {settings.llmProvider === 'gemini' && 'Google Gemini API. Get your API key from aistudio.google.com'}
                </div>
              </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button
                  onClick={() => {
                    // Save settings to localStorage
                    if (state.githubToken) {
                      localStorage.setItem('github_token', state.githubToken);
                    } else {
                      localStorage.removeItem('github_token');
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

        {/* Export Format Modal */}
        <ExportFormatModal
          isOpen={state.showExportModal}
          onClose={handleCloseExportModal}
          onSelectFormat={handleExportFormatSelect}
          projectName={state.githubUrl 
            ? state.githubUrl.split('/').pop()?.replace('.git', '') || 'repository'
            : 'project'
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
      </div>
    </ErrorBoundary>
  );
};

export default HomePage; 
