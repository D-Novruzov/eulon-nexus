import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { KnowledgeGraph } from '../../../core/graph/types.ts';
import { LLMService, type LLMProvider, type LLMConfig } from '../../../ai/llm-service.ts';
import { CypherGenerator } from '../../../ai/cypher-generator.ts';
import { ReActAgent, type ReActResult, type ReActOptions } from '../../../ai/react-agent.ts';
// KuzuDB query engine removed - using SimpleKnowledgeGraph directly
import { sessionManager, type SessionInfo } from '../../../lib/session-manager.ts';
import { ChatSessionManager, LocalStorageChatHistory, type ChatHistoryMetadata } from '../../../lib/chat-history.ts';
import { AIMessage } from '@langchain/core/messages';
import { useSettings } from '../../hooks/useSettings.ts';
// Query cache functionality removed - using direct graph queries

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: {
    cypherQueries?: Array<{ cypher: string; explanation: string; confidence?: number }>;
    sources?: string[];
    confidence?: number;
    reasoning?: Array<{ 
      step: number; 
      thought: string; 
      action: string;
      actionInput?: string;
      observation?: string;
      toolResult?: {
        toolName: string;
        input: string;
        output: string;
        success: boolean;
        error?: string;
      };
    }>;
    debugInfo?: {
      llmConfig: LLMConfig;
      ragOptions: ReActOptions;
      contextInfo: {
        nodeCount: number;
        fileCount: number;
        hasContext: boolean;
      };
      totalExecutionTime?: number;
      queryExecutionTimes?: Array<{ query: string; time: number }>;
    };
    cacheSuggestions?: Array<{
      cypherQuery: string;
      confidence: number;
      similarity: number;
      sourceQuestion: string;
    }>;
  };
}

interface ChatInterfaceProps {
  graph: KnowledgeGraph;
  fileContents: Map<string, string>;
  projectName?: string;
  className?: string;
  style?: React.CSSProperties;
}

// LLMSettings interface removed - using useSettings hook

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  graph,
  fileContents,
  projectName = 'Unknown Project',
  className = '',
  style = {}
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [showSessionManager, setShowSessionManager] = useState(false);
  const [chatHistory, setChatHistory] = useState<LocalStorageChatHistory | null>(null);
  // Query cache removed - using direct graph queries
  
  // Use settings hook for LLM configuration
  const { settings, updateSetting, getCurrentProviderApiKey, updateCurrentProviderApiKey } = useSettings();
  
  // Dynamic model fetching
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('');

  // Services
  const [llmService] = useState(new LLMService());
  const [cypherGenerator] = useState(new CypherGenerator(llmService));
  // Create ReActAgent with initial graph, will be updated in useEffect
  const [ragOrchestrator] = useState(() => new ReActAgent(llmService, cypherGenerator, graph));

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Initialize RAG context when graph or fileContents change
  useEffect(() => {
    const initializeOrchestrator = async () => {
      try {
        await ragOrchestrator.initialize();
        
        // Update graph reference in ReActAgent
        if (graph) {
          (ragOrchestrator as any).graph = graph;
          console.log('✅ Updated graph reference in ReActAgent:', graph.constructor.name);
        }
        
        // Only set context if we have valid graph data
        if (graph && graph.nodes && graph.nodes.length > 0) {
          // First, load the sessions list to check current state
          refreshSessions();
          
          // Get or create session - use sessionManager for consistency
          let sessionId = sessionManager.getCurrentSession();
          if (!sessionId) {
            sessionId = sessionManager.createSession({ 
              projectName,
              switchToSession: true
            });
          }
          
          // Initialize chat history
          const history = new LocalStorageChatHistory(sessionId);
          setChatHistory(history);
          setCurrentSessionId(sessionId);
          
          // Set context with graph data
          const llmConfig: LLMConfig = {
            provider: settings.llmProvider,
            model: settings.llmProvider === 'azure-openai' 
              ? settings.azureOpenAIDeploymentName || 'gpt-4o-mini' 
              : selectedModel || 'gpt-4o-mini',
            temperature: 0.1,
            // Removed maxTokens - let OpenAI handle token limits automatically
            apiKey: getCurrentProviderApiKey(),
            azureOpenAIEndpoint: settings.azureOpenAIEndpoint,
            azureOpenAIDeploymentName: settings.azureOpenAIDeploymentName,
            azureOpenAIApiVersion: settings.azureOpenAIApiVersion
          };
          
          await ragOrchestrator.setContext({ 
            graph, 
            fileContents, 
            projectName,
            sessionId 
          }, llmConfig);
          
          // Set chat history for conversation context
          ragOrchestrator.setChatHistory(history);
          
          // Load conversation history from chat history
          await loadConversationHistory(history);
          
          // Refresh sessions again after initialization
          refreshSessions();
        } else {
          console.log('No valid graph data available yet, skipping context initialization');
        }
      } catch (error) {
        console.error('Failed to initialize orchestrator:', error);
      }
    };
    
    initializeOrchestrator();
  }, [graph, fileContents, projectName, ragOrchestrator]);

  // Load conversation history from chat history
  const loadConversationHistory = async (history: LocalStorageChatHistory) => {
    try {
      const langchainMessages = await history.getMessages();
      const chatMessages = langchainMessages.map((msg, index) => ({
        id: `history_${index}`,
        role: msg.constructor.name === 'HumanMessage' ? 'user' as const : 'assistant' as const,
        content: msg.content.toString(),
        timestamp: new Date((msg.additional_kwargs?.metadata as ChatHistoryMetadata)?.timestamp || Date.now()),
        metadata: (msg.additional_kwargs?.metadata as ChatHistoryMetadata) || undefined
      }));
      
      setMessages(chatMessages);
    } catch (error) {
      console.error('Failed to load conversation history:', error);
    }
  };

  // Settings are managed by useSettings hook

  // Fetch available models when provider or API key changes
  useEffect(() => {
    const fetchModels = async () => {
      const apiKey = getCurrentProviderApiKey();
      
      if (!apiKey || !settings.llmProvider) {
        // Use static fallback models
        const staticModels = llmService.getAvailableModels(settings.llmProvider);
        setAvailableModels(staticModels);
        setSelectedModel(staticModels[0] || '');
        return;
      }

      setIsLoadingModels(true);
      try {
        console.log('🔄 Fetching models for provider:', settings.llmProvider);
        const models = await llmService.fetchAvailableModels(settings.llmProvider, apiKey);
        setAvailableModels(models);
        
        // Set default model if none selected
        if (!selectedModel || !models.includes(selectedModel)) {
          setSelectedModel(models[0] || '');
        }
        
        console.log('✅ Models fetched successfully:', models);
      } catch (error) {
        console.warn('❌ Failed to fetch models, using fallback:', error);
        const staticModels = llmService.getAvailableModels(settings.llmProvider);
        setAvailableModels(staticModels);
        setSelectedModel(staticModels[0] || '');
      } finally {
        setIsLoadingModels(false);
      }
    };

    fetchModels();
  }, [settings.llmProvider, getCurrentProviderApiKey()]); // Removed selectedModel and llmService to prevent loops

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading || !chatHistory) return;

    // Validate API key
    const currentApiKey = getCurrentProviderApiKey();
    
    // Debug logging
    console.log('🔍 Debug API Key Check:', {
      provider: settings.llmProvider,
      hasApiKey: !!currentApiKey,
      apiKeyLength: currentApiKey?.length || 0,
      apiKeyPrefix: currentApiKey?.substring(0, 6) || 'none',
      allSettings: {
        openaiApiKey: !!settings.openaiApiKey ? `${settings.openaiApiKey.substring(0, 6)}...` : 'empty',
        azureApiKey: !!settings.azureApiKey ? `${settings.azureApiKey.substring(0, 6)}...` : 'empty',
        anthropicApiKey: !!settings.anthropicApiKey ? `${settings.anthropicApiKey.substring(0, 6)}...` : 'empty',
        geminiApiKey: !!settings.geminiApiKey ? `${settings.geminiApiKey.substring(0, 6)}...` : 'empty'
      },
      localStorage: {
        openai_api_key: localStorage.getItem('openai_api_key') ? `${localStorage.getItem('openai_api_key')?.substring(0, 6)}...` : 'null',
        azure_api_key: localStorage.getItem('azure_api_key') ? `${localStorage.getItem('azure_api_key')?.substring(0, 6)}...` : 'null',
        anthropic_api_key: localStorage.getItem('anthropic_api_key') ? `${localStorage.getItem('anthropic_api_key')?.substring(0, 6)}...` : 'null',
        gemini_api_key: localStorage.getItem('gemini_api_key') ? `${localStorage.getItem('gemini_api_key')?.substring(0, 6)}...` : 'null',
        llm_provider: localStorage.getItem('llm_provider')
      }
    });
    
    if (!currentApiKey.trim()) {
      alert('Please configure your API key in settings');
      setShowSettings(true);
      return;
    }

    if (!llmService.validateApiKey(settings.llmProvider, currentApiKey)) {
      alert('Invalid API key format. Please check your settings.');
      setShowSettings(true);
      return;
    }

    // Additional validation for Azure OpenAI
    if (settings.llmProvider === 'azure-openai') {
      if (!settings.azureOpenAIEndpoint?.trim()) {
        alert('Please configure your Azure OpenAI endpoint in settings');
        setShowSettings(true);
        return;
      }
      if (!settings.azureOpenAIDeploymentName?.trim()) {
        alert('Please configure your Azure OpenAI deployment name in settings');
        setShowSettings(true);
        return;
      }
    }

    // Check if we have a valid graph context
    if (!graph || !graph.nodes || graph.nodes.length === 0) {
      alert('No codebase loaded yet. Please load a repository first to analyze.');
      return;
    }

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date()
    };

    // Query cache removed - using direct processing

    // Save user message to chat history
    await chatHistory.addUserMessage(userMessage.content);
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const startTime = Date.now();
      
      const llmConfig: LLMConfig = {
        provider: settings.llmProvider,
        apiKey: currentApiKey,
        model: settings.llmProvider === 'azure-openai' 
          ? settings.azureOpenAIDeploymentName || 'gpt-4o-mini' 
          : selectedModel || 'gpt-4o-mini',
        temperature: 0.1,
        // Removed maxTokens - let OpenAI handle token limits automatically
        // Azure OpenAI specific fields
        azureOpenAIEndpoint: settings.azureOpenAIEndpoint,
        azureOpenAIDeploymentName: settings.azureOpenAIDeploymentName,
        azureOpenAIApiVersion: settings.azureOpenAIApiVersion
      };

      // Debug logging for LLM config
      console.log('🚀 LLM Config being sent:', {
        provider: llmConfig.provider,
        hasApiKey: !!llmConfig.apiKey,
        apiKeyLength: llmConfig.apiKey?.length || 0,
        apiKeyPrefix: llmConfig.apiKey?.substring(0, 6) || 'none',
        model: llmConfig.model,
        selectedModel: selectedModel,
        availableModels: availableModels,
        azureEndpoint: llmConfig.azureOpenAIEndpoint,
        azureDeployment: llmConfig.azureOpenAIDeploymentName,
        azureApiVersion: llmConfig.azureOpenAIApiVersion
      });

      const ragOptions: ReActOptions = {
        maxIterations: 5,
        includeReasoning: true, // Always include reasoning for better UX
        temperature: 0.1,
        enableQueryCaching: true,
        similarityThreshold: 0.8
      };

      const response: ReActResult = await ragOrchestrator.processQuestion(
        userMessage.content,
        llmConfig,
        ragOptions
      );

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: response.answer,
        timestamp: new Date(),
        metadata: {
          cypherQueries: response.cypherQueries.map(q => ({
            cypher: q.cypher,
            explanation: q.explanation,
            confidence: q.confidence
          })),
          sources: response.sources,
          confidence: response.confidence,
          reasoning: response.reasoning.map(r => ({
            step: r.step,
            thought: r.thought,
            action: r.action,
            actionInput: r.actionInput,
            observation: r.observation,
            toolResult: r.toolResult
          })),
          debugInfo: {
            llmConfig,
            ragOptions,
            contextInfo: {
              nodeCount: 0, // TODO: Implement getContextInfo
              fileCount: fileContents.size,
              hasContext: true
            },
            totalExecutionTime: executionTime,
            queryExecutionTimes: response.cypherQueries.map(q => ({
              query: q.cypher,
              time: 0 // We'd need to instrument the query engine for this
            }))
          }
        }
      };

      // Save assistant message with metadata to chat history for learning and caching
      const metadata: ChatHistoryMetadata = {
        cypherQuery: response.cypherQueries.length > 0 ? response.cypherQueries[0].cypher : undefined,
        queryResult: response.cypherQueries.length > 0 ? response.cypherQueries as unknown : undefined,
        executionTime: executionTime,
        timestamp: Date.now(),
        confidence: response.confidence,
        sources: response.sources
      };

      await chatHistory.addMessageWithMetadata(
        new AIMessage(response.answer),
        metadata
      );

      // Query learning removed - using direct processing

      // Cache suggestions removed - using direct processing

      setMessages(prev => [...prev, assistantMessage]);

    } catch (error) {
      const errorMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: `I apologize, but I encountered an error while processing your question: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date()
      };

      // Save error message to chat history
      await chatHistory.addAIChatMessage(errorMessage.content);
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle key press in textarea
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  // Session management functions
  const refreshSessions = () => {
    const allSessions = sessionManager.getAllSessions();
    setSessions(allSessions);
  };

  const createNewSession = () => {
    try {
      const sessionId = sessionManager.createSession({ 
        name: `Chat ${new Date().toLocaleString()}`,
        projectName,
        switchToSession: true
      });
      setCurrentSessionId(sessionId);
      setMessages([]);
      
      // Initialize new chat history
      const history = new LocalStorageChatHistory(sessionId);
      setChatHistory(history);
      
      refreshSessions();
    } catch (error) {
      console.error('Error creating new session:', error);
      // Refresh sessions to ensure UI state is consistent
      refreshSessions();
    }
  };

  const switchSession = async (sessionId: string) => {
    try {
      if (sessionManager.switchToSession(sessionId)) {
        setCurrentSessionId(sessionId);
        
        // Initialize new chat history
        const history = new LocalStorageChatHistory(sessionId);
        setChatHistory(history);
        
        // Load conversation history for the new session
        const llmConfig: LLMConfig = {
          provider: settings.llmProvider,
          model: settings.llmProvider === 'azure-openai' 
            ? settings.azureOpenAIDeploymentName || 'gpt-4o-mini' 
            : selectedModel || 'gpt-4o-mini',
          temperature: 0.1,
          // Removed maxTokens - let OpenAI handle token limits automatically
          apiKey: getCurrentProviderApiKey(),
          azureOpenAIEndpoint: settings.azureOpenAIEndpoint,
          azureOpenAIDeploymentName: settings.azureOpenAIDeploymentName,
          azureOpenAIApiVersion: settings.azureOpenAIApiVersion
        };
        
        await ragOrchestrator.setContext({ 
          graph, 
          fileContents, 
          projectName,
          sessionId 
        }, llmConfig);
        
        // Set chat history for conversation context
        ragOrchestrator.setChatHistory(history);
        
        // Load conversation history from chat history
        await loadConversationHistory(history);
        refreshSessions();
      } else {
        console.warn('Failed to switch to session:', sessionId);
      }
    } catch (error) {
      console.error('Error switching session:', error);
      // Refresh sessions to ensure UI state is consistent
      refreshSessions();
    }
  };

  const deleteSession = async (sessionId: string) => {
    if (confirm('Are you sure you want to delete this conversation?')) {
      try {
        const wasCurrentSession = currentSessionId === sessionId;
        
        if (sessionManager.deleteSession(sessionId)) {
          // If we deleted the current session, check what to do next
          if (wasCurrentSession) {
            const newCurrentSession = ChatSessionManager.getCurrentSession();
            
            if (newCurrentSession) {
              // Switch to the new current session
              await switchSession(newCurrentSession);
            } else {
              // No sessions remaining, create a new one
              createNewSession();
            }
          }
          refreshSessions();
        } else {
          console.warn('Failed to delete session, it might be the only session remaining');
        }
      } catch (error) {
        console.error('Error deleting session:', error);
        // Refresh sessions to ensure UI state is consistent
        refreshSessions();
      }
    }
  };

  const renameSession = (sessionId: string, newName: string) => {
    try {
      if (sessionManager.renameSession(sessionId, newName)) {
        refreshSessions();
      } else {
        console.warn('Failed to rename session');
      }
    } catch (error) {
      console.error('Error renaming session:', error);
      // Refresh sessions to ensure UI state is consistent
      refreshSessions();
    }
  };

  // Clear conversation
  const clearConversation = async () => {
    if (confirm('Are you sure you want to clear this conversation?') && chatHistory) {
      await chatHistory.clear();
      setMessages([]);
    }
  };

  // Reasoning Component for Assistant Messages
  const ReasoningSection: React.FC<{ reasoning: NonNullable<ChatMessage['metadata']>['reasoning'] }> = ({ reasoning }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!reasoning || reasoning.length === 0) {
      return null;
    }

    return (
      <div style={{ 
        marginTop: '12px', 
        borderTop: `1px solid ${chatColors.border}`, 
        paddingTop: '12px' 
      }}>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          style={{
            background: 'transparent',
            border: 'none',
            color: chatColors.textSecondary,
            cursor: 'pointer',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '0',
            textDecoration: 'underline'
          }}
        >
          {isExpanded ? '▼' : '▶'} Show thought process ({reasoning.length} steps)
        </button>
        
        {isExpanded && (
          <div style={{ 
            marginTop: '8px',
            padding: '14px',
            backgroundColor: 'rgba(30,41,59,0.8)',
            borderRadius: '12px',
            border: `1px solid ${chatColors.border}`
          }}>
            <div style={{ fontSize: '11px', color: chatColors.textSecondary, marginBottom: '8px', fontWeight: '500' }}>
              🤔 Reasoning Process:
            </div>
             {reasoning.map((step, index: number) => (
               <div key={index} style={{ 
                 marginBottom: index < reasoning.length - 1 ? '12px' : '0',
                 padding: '10px',
                 backgroundColor: 'rgba(15,23,42,0.7)',
                 borderRadius: '10px',
                 border: `1px solid ${chatColors.borderSubtle}`
               }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  marginBottom: '6px',
                  fontSize: '11px'
                }}>
                  <span style={{ 
                    backgroundColor: '#38bdf8', 
                    color: '#0f172a', 
                    borderRadius: '50%', 
                    width: '16px', 
                    height: '16px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    fontSize: '10px',
                    fontWeight: 'bold'
                  }}>
                    {step.step}
                  </span>
                  <span style={{ 
                    backgroundColor: step.toolResult?.success 
                      ? 'rgba(34,197,94,0.2)' 
                      : step.toolResult?.success === false
                      ? 'rgba(248,113,113,0.2)'
                      : 'rgba(99,102,241,0.2)',
                    color: step.toolResult?.success 
                      ? '#4ade80' 
                      : step.toolResult?.success === false
                      ? '#fca5a5'
                      : '#c4b5fd',
                    padding: '3px 8px',
                    borderRadius: '999px',
                    fontSize: '10px',
                    fontWeight: '500'
                  }}>
                    {step.action}
                  </span>
                </div>
                
                <div style={{ fontSize: '12px', lineHeight: '1.5', color: chatColors.text }}>
                  <div style={{ marginBottom: '4px' }}>
                    <strong>Thought:</strong> {step.thought}
                  </div>
                  
                  {step.actionInput && (
                    <div style={{ marginBottom: '4px' }}>
                      <strong>Input:</strong> 
                      <code style={{ 
                        backgroundColor: 'rgba(15,23,42,0.8)', 
                        padding: '2px 5px', 
                        borderRadius: '6px',
                        fontSize: '11px',
                        marginLeft: '4px'
                      }}>
                        {step.actionInput}
                      </code>
                    </div>
                  )}
                  
                  {step.observation && (
                    <div style={{ 
                      marginTop: '6px',
                      padding: '8px',
                      backgroundColor: chatColors.success,
                      borderRadius: '8px',
                      fontSize: '11px'
                    }}>
                      <strong>Result:</strong> {step.observation}
                    </div>
                  )}
                  
                  {step.toolResult && step.toolResult.error && (
                    <div style={{ 
                      marginTop: '6px',
                      padding: '8px',
                      backgroundColor: chatColors.warning,
                      borderRadius: '8px',
                      fontSize: '11px',
                      color: '#f87171'
                    }}>
                      <strong>Error:</strong> {step.toolResult.error}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Generate unique ID
  const generateId = () => {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  // Markdown Content Component
  const MarkdownContent: React.FC<{ content: string; role: 'user' | 'assistant' }> = ({ content, role }) => {
    if (role === 'user') {
      // Don't apply markdown to user messages
      return <div>{content}</div>;
    }

    return (
      <div className="markdown-content">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={{
            // Custom styling for different markdown elements
            h1: ({ children }) => <h1 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px', color: chatColors.text }}>{children}</h1>,
            h2: ({ children }) => <h2 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px', color: chatColors.text }}>{children}</h2>,
            h3: ({ children }) => <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px', color: chatColors.text }}>{children}</h3>,
            p: ({ children }) => <p style={{ marginBottom: '12px', lineHeight: '1.5', color: chatColors.textSecondary }}>{children}</p>,
            ul: ({ children }) => <ul style={{ marginBottom: '12px', paddingLeft: '20px', color: chatColors.textSecondary }}>{children}</ul>,
            ol: ({ children }) => <ol style={{ marginBottom: '12px', paddingLeft: '20px', color: chatColors.textSecondary }}>{children}</ol>,
            li: ({ children }) => <li style={{ marginBottom: '4px', lineHeight: '1.4' }}>{children}</li>,
            code: ({ children, className, ...props }) => {
              const inline = !className?.includes('language-');
              return inline ? (
                <code 
                  style={{ 
                    backgroundColor: 'rgba(15,23,42,0.8)', 
                    padding: '2px 4px', 
                    borderRadius: '6px', 
                    fontSize: '13px',
                    fontFamily: 'Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    color: chatColors.text,
                  }}
                  {...props}
                >
                  {children}
                </code>
              ) : (
                <pre style={{ 
                  backgroundColor: 'rgba(2,6,23,0.75)', 
                  padding: '14px', 
                  borderRadius: '12px', 
                  overflow: 'auto',
                  marginBottom: '12px',
                  border: `1px solid ${chatColors.border}`
                }}>
                  <code 
                    style={{ 
                      fontSize: '13px',
                      fontFamily: 'Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                    }}
                    className={className}
                    {...props}
                  >
                    {children}
                  </code>
                </pre>
              );
            },
            blockquote: ({ children }) => (
              <blockquote style={{ 
                borderLeft: `4px solid ${chatColors.border}`, 
                paddingLeft: '12px', 
                marginLeft: '0',
                marginBottom: '12px',
                fontStyle: 'italic',
                color: chatColors.textSecondary
              }}>
                {children}
              </blockquote>
            ),
            table: ({ children }) => (
              <table style={{ 
                borderCollapse: 'collapse', 
                width: '100%', 
                marginBottom: '12px',
                fontSize: '13px',
                color: chatColors.text
              }}>
                {children}
              </table>
            ),
            th: ({ children }) => (
              <th style={{ 
                border: `1px solid ${chatColors.border}`, 
                padding: '8px', 
                backgroundColor: 'rgba(15,23,42,0.6)',
                fontWeight: 'bold',
                textAlign: 'left'
              }}>
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td style={{ 
                border: `1px solid ${chatColors.border}`, 
                padding: '8px'
              }}>
                {children}
              </td>
            ),
            strong: ({ children }) => <strong style={{ fontWeight: '600' }}>{children}</strong>,
            em: ({ children }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
            a: ({ children, href }) => (
              <a 
                href={href} 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ 
                  color: '#38bdf8', 
                  textDecoration: 'none'
                }}
                onMouseOver={(e) => e.currentTarget.style.textDecoration = 'underline'}
                onMouseOut={(e) => e.currentTarget.style.textDecoration = 'none'}
              >
                {children}
              </a>
            )
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    );
  };

  // Get available models for current provider (now using dynamic models)
  const getAvailableModels = () => {
    return availableModels.length > 0 ? availableModels : llmService.getAvailableModels(settings.llmProvider);
  };

  const chatColors = {
    background: '#010314',
    surface: 'rgba(7, 12, 28, 0.9)',
    surfaceAlt: 'rgba(12, 18, 35, 0.75)',
    panel: 'rgba(3, 8, 22, 0.9)',
    border: 'rgba(99, 102, 241, 0.3)',
    borderSubtle: 'rgba(99, 102, 241, 0.15)',
    text: '#f8fafc',
    textSecondary: '#a5b4fc',
    muted: '#64748b',
    userBubble: 'linear-gradient(135deg, #22d3ee 0%, #38bdf8 45%, #a855f7 100%)',
    assistantBubble: 'rgba(10, 16, 34, 0.95)',
    chip: 'rgba(59, 130, 246, 0.15)',
    warning: 'rgba(250, 204, 21, 0.15)',
    success: 'rgba(34, 197, 94, 0.15)',
    glow: 'rgba(56,189,248,0.25)',
  };

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: '560px',
    border: `1px solid ${chatColors.border}`,
    borderRadius: '24px',
    background: 'linear-gradient(160deg, rgba(1,4,19,0.95) 0%, rgba(8,18,40,0.9) 40%, rgba(23,14,54,0.85) 100%)',
    boxShadow: '0 25px 60px rgba(2,6,23,0.6)',
    overflow: 'hidden',
    color: chatColors.text,
    ...style
  };

  const headerStyle: React.CSSProperties = {
    padding: '24px',
    borderBottom: `1px solid ${chatColors.border}`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    background: chatColors.surface,
    backdropFilter: 'blur(18px)',
    gap: '12px',
  };

  const overviewCardStyle: React.CSSProperties = {
    padding: '18px 24px 20px',
    borderBottom: `1px solid ${chatColors.borderSubtle}`,
    background: chatColors.panel,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '18px',
    flexWrap: 'wrap',
  };

  const avatarStyle: React.CSSProperties = {
    width: 60,
    height: 60,
    borderRadius: '20px',
    background: 'linear-gradient(160deg, #38bdf8, #a855f7)',
    boxShadow: '0 18px 35px rgba(56,189,248,0.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '28px',
    color: '#0b1120',
  };

  const controlClusterStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  };

  const messagesStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  };

  const inputAreaStyle: React.CSSProperties = {
    padding: '20px 24px',
    borderTop: `1px solid ${chatColors.border}`,
    background: 'rgba(15,23,42,0.8)',
    backdropFilter: 'blur(18px)',
  };

  const messageStyle = (role: 'user' | 'assistant'): React.CSSProperties => ({
    padding: '16px 20px',
    borderRadius: '18px',
    maxWidth: '78%',
    alignSelf: role === 'user' ? 'flex-end' : 'flex-start',
    background: role === 'user' ? chatColors.userBubble : chatColors.assistantBubble,
    color: role === 'user' ? '#0b1120' : chatColors.text,
    border: role === 'user' ? 'none' : `1px solid ${chatColors.border}`,
    boxShadow: role === 'user'
      ? '0 10px 30px rgba(34,211,238,0.25)'
      : '0 15px 40px rgba(2,6,23,0.55)',
    wordWrap: 'break-word',
  });

  const buttonStyle: React.CSSProperties = {
    padding: '8px 16px',
    border: `1px solid ${chatColors.border}`,
    borderRadius: '12px',
    background: 'rgba(15,23,42,0.9)',
    color: chatColors.text,
    cursor: 'pointer',
    fontSize: '13px',
    transition: 'all 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const controlButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    minWidth: '150px',
    padding: '12px 20px',
    borderRadius: '999px',
    fontWeight: 600,
    fontSize: '13px',
    background: 'rgba(15,23,42,0.92)',
    borderColor: chatColors.borderSubtle,
  };

  const iconButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    width: '44px',
    height: '44px',
    borderRadius: '16px',
    padding: 0,
    fontSize: '16px',
  };

  const textareaStyle: React.CSSProperties = {
    width: '100%',
    minHeight: '60px',
    padding: '14px 16px',
    border: `1px solid ${chatColors.border}`,
    borderRadius: '16px',
    resize: 'vertical',
    fontSize: '14px',
    fontFamily: 'inherit',
    background: 'rgba(2,6,23,0.6)',
    color: chatColors.text,
    outline: 'none',
  };

  return (
    <div className={`chat-interface ${className}`} style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div>
          <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.3em', color: chatColors.textSecondary }}>
            Conversational copilot
          </div>
          <div style={{ marginTop: '6px', fontSize: '14px', color: chatColors.muted }}>
            LLM-assisted exploration with repository context
          </div>
        </div>
        <div
          style={{
            padding: '6px 14px',
            borderRadius: '999px',
            border: `1px solid ${chatColors.border}`,
            color: chatColors.textSecondary,
            fontSize: '11px',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            background: 'rgba(255,255,255,0.03)',
          }}
        >
          Live graph
        </div>
      </div>

      <div style={overviewCardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <div style={avatarStyle}>💬</div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '0.08em', color: chatColors.text }}>
              Nexus Copilot
            </div>
            <div
              style={{
                marginTop: '8px',
                fontSize: '12px',
                color: chatColors.textSecondary,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: '999px',
                  background: chatColors.chip,
                  color: '#93c5fd',
                  fontSize: '11px',
                }}
              >
                {llmService.getProviderDisplayName(settings.llmProvider)}
              </span>
              <span style={{ color: chatColors.muted }}>Project: {projectName}</span>
              <span style={{ color: chatColors.muted }}>Sessions: {sessions.length}</span>
            </div>
          </div>
        </div>

        <div style={controlClusterStyle}>
          <button
            onClick={() => setShowSessionManager(!showSessionManager)}
            style={{
              ...controlButtonStyle,
              borderColor: showSessionManager ? 'rgba(16,185,129,0.45)' : chatColors.borderSubtle,
              background: showSessionManager ? 'rgba(16,185,129,0.15)' : 'rgba(15,23,42,0.92)',
            }}
            title="Manage chat sessions"
          >
            💬 Sessions ({sessions.length})
          </button>
          <button
            onClick={createNewSession}
            style={{
              ...controlButtonStyle,
              background: 'linear-gradient(120deg, #38bdf8, #6366f1, #a855f7)',
              border: 'none',
              color: '#0f172a',
              boxShadow: '0 15px 35px rgba(56,189,248,0.35)',
            }}
            title="Start new conversation"
          >
            ➕ New
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            style={iconButtonStyle}
            title="Settings"
          >
            ⚙️
          </button>
          <button
            onClick={clearConversation}
            style={{
              ...iconButtonStyle,
              borderColor: 'rgba(248,113,113,0.45)',
              background: 'rgba(248,113,113,0.15)',
              color: '#fecdd3',
            }}
            title="Clear conversation"
          >
            🗑️
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div
          style={{
            padding: '20px 24px',
            backgroundColor: 'rgba(8,13,28,0.92)',
            borderBottom: `1px solid ${chatColors.border}`,
            backdropFilter: 'blur(18px)',
          }}
        >
          <h4
            style={{
              margin: '0 0 18px 0',
              fontSize: '14px',
              textTransform: 'uppercase',
              letterSpacing: '0.25em',
              color: chatColors.textSecondary,
            }}
          >
            LLM Configuration
          </h4>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ fontSize: '11px', color: chatColors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.2em' }}>Provider</label>
              <select
                value={settings.llmProvider}
                onChange={(e) => updateSetting('llmProvider', e.target.value as LLMProvider)}
                style={{ 
                  width: '100%', 
                  padding: '10px 12px', 
                  fontSize: '13px',
                  borderRadius: '12px',
                  border: `1px solid ${chatColors.border}`,
                  background: 'rgba(2,6,23,0.65)',
                  color: chatColors.text,
                }}
              >
                <option value="openai">OpenAI</option>
                <option value="azure-openai">Azure OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="gemini">Google Gemini</option>
              </select>
            </div>
            
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{ fontSize: '11px', color: chatColors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.2em' }}>
                  {settings.llmProvider === 'azure-openai' ? 'Deployment Name' : 'Model'}
                  {isLoadingModels && ' (Loading...)'}
                </label>
                {settings.llmProvider === 'openai' && (
                  <button
                    onClick={async () => {
                      const apiKey = getCurrentProviderApiKey();
                      if (apiKey) {
                        setIsLoadingModels(true);
                        try {
                          const models = await llmService.fetchAvailableModels(settings.llmProvider, apiKey);
                          setAvailableModels(models);
                          console.log('🔄 Models refreshed:', models);
                        } catch (error) {
                          console.warn('Failed to refresh models:', error);
                        } finally {
                          setIsLoadingModels(false);
                        }
                      }
                    }}
                    disabled={isLoadingModels || !getCurrentProviderApiKey()}
                    style={{
                      fontSize: '11px',
                      padding: '4px 8px',
                      backgroundColor: 'rgba(15,23,42,0.7)',
                      border: `1px solid ${chatColors.border}`,
                      borderRadius: '10px',
                      cursor: isLoadingModels ? 'wait' : 'pointer',
                      opacity: isLoadingModels || !getCurrentProviderApiKey() ? 0.5 : 1
                    }}
                    title="Refresh available models from OpenAI"
                  >
                    🔄
                  </button>
                )}
              </div>
              {settings.llmProvider === 'azure-openai' ? (
                <input
                  type="text"
                  value={settings.azureOpenAIDeploymentName || ''}
                  onChange={(e) => updateSetting('azureOpenAIDeploymentName', e.target.value)}
                  placeholder="gpt-4.1-mini-v2"
                  style={{ 
                    width: '100%', 
                    padding: '10px 12px', 
                    fontSize: '13px',
                    borderRadius: '12px',
                    border: `1px solid ${chatColors.border}`,
                    background: 'rgba(2,6,23,0.65)',
                    color: chatColors.text,
                  }}
                />
              ) : (
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  style={{ 
                    width: '100%', 
                    padding: '10px 12px', 
                    fontSize: '13px',
                    opacity: isLoadingModels ? 0.6 : 1,
                    cursor: isLoadingModels ? 'wait' : 'pointer',
                    borderRadius: '12px',
                    border: `1px solid ${chatColors.border}`,
                    background: 'rgba(2,6,23,0.65)',
                    color: chatColors.text,
                  }}
                  disabled={isLoadingModels}
                >
                  {isLoadingModels ? (
                    <option value="">Loading models...</option>
                  ) : (
                    getAvailableModels().map(model => (
                      <option key={model} value={model}>
                        {model}
                        {model === selectedModel ? ' (selected)' : ''}
                      </option>
                    ))
                  )}
                </select>
              )}
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '11px', color: chatColors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.2em' }}>API Key</label>
            <input
              type="password"
              value={getCurrentProviderApiKey()}
              onChange={(e) => updateCurrentProviderApiKey(e.target.value)}
              placeholder={
                settings.llmProvider === 'azure-openai' ? 'Your Azure OpenAI key...' :
                settings.llmProvider === 'anthropic' ? 'sk-ant-...' :
                settings.llmProvider === 'gemini' ? 'Your Google API key...' : 'sk-...'
              }
              style={{ 
                width: '100%', 
                padding: '10px 12px', 
                fontSize: '13px',
                borderRadius: '12px',
                border: `1px solid ${chatColors.border}`,
                background: 'rgba(2,6,23,0.65)',
                color: chatColors.text,
              }}
            />
          </div>

          {/* Azure OpenAI Specific Fields */}
          {settings.llmProvider === 'azure-openai' && (
            <>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '11px', color: chatColors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.2em' }}>Azure OpenAI Endpoint</label>
                <input
                  type="text"
                  value={settings.azureOpenAIEndpoint || ''}
                  onChange={(e) => updateSetting('azureOpenAIEndpoint', e.target.value)}
                  placeholder="https://your-resource.openai.azure.com"
                  style={{ 
                    width: '100%', 
                    padding: '10px 12px', 
                    fontSize: '13px',
                    borderRadius: '12px',
                    border: `1px solid ${chatColors.border}`,
                    background: 'rgba(2,6,23,0.65)',
                    color: chatColors.text,
                  }}
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '11px', color: chatColors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.2em' }}>API Version</label>
                <input
                  type="text"
                  value={settings.azureOpenAIApiVersion || '2024-02-01'}
                  onChange={(e) => updateSetting('azureOpenAIApiVersion', e.target.value)}
                  placeholder="2024-02-01"
                  style={{ 
                    width: '100%', 
                    padding: '10px 12px', 
                    fontSize: '13px',
                    borderRadius: '12px',
                    border: `1px solid ${chatColors.border}`,
                    background: 'rgba(2,6,23,0.65)',
                    color: chatColors.text,
                  }}
                />
              </div>
            </>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', color: chatColors.textSecondary, fontSize: '12px' }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>Temperature: 0.1 (fixed)</div>
              <div>Optimized for deterministic repository answers</div>
            </div>
            
            <div>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>Token Limits</div>
              <div>Managed automatically per provider</div>
            </div>
          </div>

          {/* Save Button */}
          <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              onClick={() => {
                // Settings are automatically saved by useSettings hook
                setShowSettings(false);
                alert('Settings saved successfully!');
              }}
              style={{
                ...buttonStyle,
                background: 'linear-gradient(120deg, #22d3ee, #a855f7)',
                border: 'none',
                fontSize: '12px',
                padding: '8px 20px',
                color: '#0f172a',
              }}
            >
              💾 Save Settings
            </button>
            <button
              onClick={() => setShowSettings(false)}
              style={{
                ...buttonStyle,
                fontSize: '12px',
                padding: '8px 20px'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Session Manager Panel */}
      {showSessionManager && (
        <div style={{
          padding: '18px 24px',
          backgroundColor: 'rgba(12,18,35,0.9)',
          borderBottom: `1px solid ${chatColors.border}`,
          maxHeight: '320px',
          overflowY: 'auto',
          backdropFilter: 'blur(14px)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h4 style={{ margin: '0', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.2em', color: chatColors.textSecondary }}>Chat Sessions</h4>
            <button
              onClick={createNewSession}
              style={{
                ...buttonStyle,
                background: 'rgba(34,197,94,0.2)',
                borderColor: 'rgba(34,197,94,0.4)',
                fontSize: '12px',
                padding: '4px 10px'
              }}
            >
              ➕ New Session
            </button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {sessions.map((session) => (
              <div
                key={session.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 12px',
                  backgroundColor: session.isActive ? 'rgba(59,130,246,0.15)' : 'rgba(15,23,42,0.6)',
                  border: session.isActive ? '1px solid rgba(59,130,246,0.5)' : `1px solid ${chatColors.borderSubtle}`,
                  borderRadius: '14px',
                  cursor: 'pointer'
                }}
                onClick={() => switchSession(session.id)}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ 
                    fontSize: '13px', 
                    fontWeight: session.isActive ? 600 : 400,
                    marginBottom: '4px',
                    color: chatColors.text,
                  }}>
                    {session.name}
                  </div>
                  <div style={{ fontSize: '11px', color: chatColors.textSecondary }}>
                    {session.messageCount} messages • {new Date(session.lastAccessed).toLocaleDateString()}
                    {session.projectName && ` • ${session.projectName}`}
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const newName = prompt('Enter new name:', session.name);
                      if (newName && newName.trim()) {
                        renameSession(session.id, newName.trim());
                      }
                    }}
                    style={{
                      ...buttonStyle,
                      background: 'rgba(251,191,36,0.2)',
                      color: '#facc15',
                      borderColor: 'rgba(251,191,36,0.35)',
                      fontSize: '11px',
                      padding: '4px 8px'
                    }}
                    title="Rename session"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession(session.id);
                    }}
                    style={{
                      ...buttonStyle,
                      background: 'rgba(248,113,113,0.2)',
                      borderColor: 'rgba(248,113,113,0.4)',
                      fontSize: '11px',
                      padding: '4px 8px'
                    }}
                    title="Delete session"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
            
            {sessions.length === 0 && (
              <div style={{ 
                textAlign: 'center',
                color: chatColors.textSecondary,
                fontSize: '12px',
                padding: '24px'
              }}>
                No chat sessions yet. Start a new conversation!
              </div>
            )}
          </div>
          
          <div style={{ 
            marginTop: '14px', 
            padding: '10px 12px', 
            backgroundColor: 'rgba(30,64,175,0.2)', 
            borderRadius: '10px',
            fontSize: '11px',
            color: chatColors.textSecondary,
            border: `1px solid ${chatColors.border}`,
          }}>
            💡 Sessions are automatically saved to your browser's local storage. 
            Each session maintains its own conversation history and can cache query results for faster responses.
          </div>
        </div>
      )}

      {/* Messages */}
      <div style={messagesStyle}>
        {messages.length === 0 && (
          <div style={{
            textAlign: 'center',
            color: chatColors.textSecondary,
            fontSize: '14px',
            padding: '48px 24px'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.4 }}>💬</div>
            <div>Ask me anything about the codebase!</div>
            <div style={{ fontSize: '12px', marginTop: '8px', color: chatColors.muted }}>
              I can help you understand ownership, dependencies, and history.
            </div>
            {(!graph || !graph.nodes || graph.nodes.length === 0) && (
              <div style={{ 
                marginTop: '20px', 
                padding: '14px', 
                backgroundColor: chatColors.warning, 
                border: `1px solid rgba(250,204,21,0.35)`,
                borderRadius: '12px',
                color: '#fde047'
              }}>
                <strong>⚠️ No codebase loaded</strong><br />
                Please load a repository first to start analyzing code.<br />
                <small style={{ fontSize: '11px', opacity: 0.8 }}>
                  The knowledge graph is being built in the background. Once complete, you'll be able to ask questions.
                </small>
              </div>
            )}
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id}>
            <div style={messageStyle(message.role)}>
              <div style={{ marginBottom: message.metadata ? '8px' : '0' }}>
                <MarkdownContent content={message.content} role={message.role} />
              </div>
              
              {/* Reasoning Section for Assistant Messages */}
              {message.role === 'assistant' && message.metadata?.reasoning && (
                <ReasoningSection reasoning={message.metadata.reasoning} />
              )}
              
              {/* Simple Metadata */}
              {message.metadata && (
                <div style={{ fontSize: '12px', opacity: 0.85, marginTop: '8px', color: chatColors.textSecondary }}>
                  {message.metadata.confidence && (
                    <div style={{ marginBottom: '4px' }}>
                      Confidence: {Math.round(message.metadata.confidence * 100)}%
                    </div>
                  )}
                  
                  {message.metadata.sources && message.metadata.sources.length > 0 && (
                    <div style={{ marginBottom: '4px' }}>
                      Sources: {message.metadata.sources.join(', ')}
                    </div>
                  )}
                  
                  {message.metadata.cypherQueries && message.metadata.cypherQueries.length > 0 && (
                    <details style={{ marginTop: '8px' }}>
                      <summary style={{ cursor: 'pointer', fontSize: '11px' }}>
                        View Queries ({message.metadata.cypherQueries.length})
                      </summary>
                      {message.metadata.cypherQueries.map((query, index) => (
                        <div key={index} style={{ 
                          marginTop: '4px', 
                          padding: '8px', 
                          backgroundColor: 'rgba(2,6,23,0.6)', 
                          borderRadius: '8px',
                          border: `1px solid ${chatColors.border}`,
                          fontFamily: 'monospace',
                          fontSize: '11px'
                        }}>
                          <div><strong>Query:</strong> {query.cypher}</div>
                          <div><strong>Explanation:</strong> {query.explanation}</div>
                        </div>
                      ))}
                    </details>
                  )}
                </div>
              )}
            </div>
            
            <div style={{
              fontSize: '11px',
              color: chatColors.muted,
              textAlign: message.role === 'user' ? 'right' : 'left',
              marginTop: '4px'
            }}>
              {message.timestamp.toLocaleTimeString()}
            </div>
          </div>
        ))}

        {isLoading && (
          <div style={messageStyle('assistant')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ 
                width: '16px', 
                height: '16px', 
                border: `2px solid ${chatColors.border}`,
                borderTop: '2px solid #38bdf8',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
              Thinking...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div style={inputAreaStyle}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px' }}>
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask a question about the code..."
            style={textareaStyle}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            style={{
              ...buttonStyle,
              minWidth: '80px',
              background: 'linear-gradient(120deg, #22d3ee, #a855f7)',
              border: 'none',
              color: '#0f172a',
              opacity: (isLoading || !inputValue.trim()) ? 0.5 : 1
            }}
          >
            {isLoading ? '...' : 'Send'}
          </button>
        </form>
      </div>

      {/* CSS for spinner animation and syntax highlighting */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .hljs {
          background: rgba(2,6,23,0.8) !important;
          color: #f8fafc !important;
        }
        .hljs-keyword,
        .hljs-selector-tag,
        .hljs-title,
        .hljs-section,
        .hljs-strong {
          color: #c084fc;
        }
        .hljs-string,
        .hljs-built_in,
        .hljs-literal,
        .hljs-tag,
        .hljs-quote,
        .hljs-name {
          color: #7dd3fc;
        }
        .hljs-comment,
        .hljs-quote,
        .hljs-variable,
        .hljs-attribute {
          color: #94a3b8;
        }
        .hljs-number,
        .hljs-meta,
        .hljs-symbol {
          color: #f472b6;
        }
        .hljs-attr,
        .hljs-bullet,
        .hljs-link {
          color: #facc15;
        }

        .chat-interface .markdown-content {
          line-height: 1.6;
        }
        .chat-interface .markdown-content > *:first-child {
          margin-top: 0;
        }
        .chat-interface .markdown-content > *:last-child {
          margin-bottom: 0;
        }
        .chat-interface .markdown-content ul,
        .chat-interface .markdown-content ol {
          margin: 8px 0 12px 0;
        }
        .chat-interface .markdown-content li {
          margin-bottom: 2px;
        }
        .chat-interface .markdown-content pre {
          max-width: 100%;
          overflow-x: auto;
          white-space: pre-wrap;
        }
        .chat-interface .markdown-content table {
          max-width: 100%;
          overflow-x: auto;
          display: block;
          white-space: nowrap;
        }
        .chat-interface .markdown-content thead,
        .chat-interface .markdown-content tbody,
        .chat-interface .markdown-content tr {
          display: table;
          width: 100%;
          table-layout: fixed;
        }
      `}</style>
    </div>
  );
};

export default ChatInterface; 
