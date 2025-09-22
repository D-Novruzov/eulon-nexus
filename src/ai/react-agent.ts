import { HumanMessage, SystemMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { z } from 'zod';
import type { LLMService, LLMConfig } from './llm-service.ts';
import type { CypherGenerator } from './cypher-generator.ts';
import type { KnowledgeGraph } from '../core/graph/types.ts';
import type { LocalStorageChatHistory } from '../lib/chat-history.ts';

export interface ReActContext {
  graph: KnowledgeGraph;
  fileContents: Map<string, string>;
  projectName?: string;
  sessionId?: string;
}

export interface ReActToolResult {
  toolName: string;
  input: string;
  output: string;
  success: boolean;
  error?: string;
}

export interface ReActStep {
  step: number;
  thought: string;
  action: string;
  actionInput?: string;
  observation?: string;
  toolResult?: ReActToolResult;
}

export interface ReActResult {
  answer: string;
  reasoning: ReActStep[];
  confidence: number;
  sources: string[];
  cypherQueries: Array<{
    cypher: string;
    explanation: string;
    confidence: number;
  }>;
}

export interface ReActOptions {
  maxIterations?: number;
  temperature?: number;
  strictMode?: boolean;
  includeReasoning?: boolean;
  enableQueryCaching?: boolean;
  similarityThreshold?: number;
}

// Define Zod schema for ReAct step
const ReActStepSchema = z.object({
  thought: z.string().describe("The reasoning process - what you're thinking about"),
  action: z.enum(['query_graph', 'get_code', 'search_files', 'final_answer']).describe("The action to take - must be one of: query_graph, get_code, search_files, or final_answer"),
  actionInput: z.string().describe("Input for the action - the query, file path, search pattern, or final answer")
});

export class ReActAgent {
  private llmService: LLMService;
  private cypherGenerator: CypherGenerator;
  private context: ReActContext | null = null;
  private chatHistory: LocalStorageChatHistory | null = null;
  private graph?: KnowledgeGraph;

  constructor(llmService: LLMService, cypherGenerator: CypherGenerator, graph?: KnowledgeGraph) {
    this.llmService = llmService;
    this.cypherGenerator = cypherGenerator;
    this.graph = graph; // Store graph reference for KuzuDB access
  }

  /**
   * Initialize the ReAct agent
   */
  public async initialize(): Promise<void> {
    console.log('ReActAgent initialized');
  }

  /**
   * Set the context for ReAct operations
   */
  public async setContext(context: ReActContext & { projectName?: string; sessionId?: string }, _llmConfig: LLMConfig): Promise<void> {
    this.context = {
      graph: context.graph,
      fileContents: context.fileContents,
      projectName: context.projectName,
      sessionId: context.sessionId
    };
    
    // Update graph reference for KuzuDB access
    this.graph = context.graph;
    
    this.cypherGenerator.updateSchema(context.graph);
    
    // Test KuzuDB connectivity
    await this.testKuzuDBConnection();
  }
  
  /**
   * Test KuzuDB connection and log results
   */
  private async testKuzuDBConnection(): Promise<void> {
    try {
      console.log('🧪 Testing KuzuDB connection...');
      const testResult = await this.executeGraphQuery('MATCH (n) RETURN COUNT(n) as nodeCount LIMIT 1');
      
      if (testResult.success && testResult.source === 'KuzuDB') {
        console.log('✅ KuzuDB connection test successful!');
        console.log(`📊 Total nodes in KuzuDB: ${testResult.rows[0]?.[0] || 'unknown'}`);
      } else {
        console.log('⚠️ KuzuDB connection test failed, using fallback');
      }
    } catch (error) {
      console.log('❌ KuzuDB connection test error:', error);
    }
  }

  /**
   * Set chat history for conversation context
   */
  public setChatHistory(chatHistory: LocalStorageChatHistory): void {
    this.chatHistory = chatHistory;
  }

  /**
   * Process a question using ReAct pattern with chat history
   */
  public async processQuestion(
    question: string,
    llmConfig: LLMConfig,
    options: ReActOptions = {}
  ): Promise<ReActResult> {
    if (!this.context) {
      throw new Error('Context not set. Call setContext() first.');
    }

    const {
      maxIterations = 5,
      temperature = 0.1,
      strictMode = false,
      includeReasoning = true
    } = options;

    const reasoning: ReActStep[] = [];
    const sources: string[] = [];
    const cypherQueries: Array<{ cypher: string; explanation: string; confidence: number }> = [];

    // Enhanced LLM config for reasoning
    const reasoningConfig: LLMConfig = {
      ...llmConfig,
      temperature: temperature
    };

    let currentStep = 1;
    let finalAnswer = '';
    let confidence = 0.5;

    try {
      // Build conversation with chat history
      const conversation: BaseMessage[] = [];
      
      // Add system prompt
      const systemPrompt = this.buildReActSystemPrompt(strictMode);
      conversation.push(new SystemMessage(systemPrompt));

      // Add chat history if available
      if (this.chatHistory) {
        try {
          const historyMessages = await this.chatHistory.getMessages();
          // Add recent history (last 10 messages to avoid context overflow)
          const recentHistory = historyMessages.slice(-10);
          conversation.push(...recentHistory);
        } catch (error) {
          console.warn('Failed to load chat history:', error);
        }
      }

      // Add the current user question
      conversation.push(new HumanMessage(`Question: ${question}`));

      while (currentStep <= maxIterations) {
        let reasoning_step: ReActStep;
        
        try {
          // Try using structured output first
          const model = this.llmService.getModel(reasoningConfig);
          console.log('Attempting structured output with model:', model.constructor.name);
          
          if (model && typeof model.withStructuredOutput === 'function') {
            console.log('Model supports structured output, attempting to use it...');
            const structuredModel = model.withStructuredOutput(ReActStepSchema);
            const structuredResponse = await structuredModel.invoke(conversation);
            
            console.log('Structured output successful:', structuredResponse);
            
            // Validate the structured response
            const validActions = ['query_graph', 'get_code', 'search_files', 'final_answer'];
            if (!validActions.includes(structuredResponse.action)) {
              console.warn(`Invalid action from structured output: ${structuredResponse.action}, falling back to regex parsing`);
              const response = await this.llmService.chat(reasoningConfig, conversation);
              reasoning_step = this.parseReasoningStep(String(response.content || ''), currentStep);
            } else {
              reasoning_step = {
                step: currentStep,
                thought: structuredResponse.thought,
                action: structuredResponse.action,
                actionInput: structuredResponse.actionInput
              };
            }
          } else {
            console.warn('Model does not support structured output, falling back to regex parsing');
            // Fallback to regular chat + regex parsing
            const response = await this.llmService.chat(reasoningConfig, conversation);
            reasoning_step = this.parseReasoningStep(String(response.content || ''), currentStep);
          }
        } catch (error) {
          // Fallback to regex parsing if structured output fails
          console.warn('Structured output failed, falling back to regex parsing:', error);
          const response = await this.llmService.chat(reasoningConfig, conversation);
          reasoning_step = this.parseReasoningStep(String(response.content || ''), currentStep);
        }

        reasoning.push(reasoning_step);

        // Check if we have a final answer
        if (reasoning_step.action === 'final_answer') {
          finalAnswer = reasoning_step.actionInput || '';
          confidence = Math.min(0.9, confidence + 0.2);
          break;
        }

        // Execute the action
        const toolResult = await this.executeAction(reasoning_step.action, reasoning_step.actionInput || '', llmConfig);
        reasoning_step.toolResult = toolResult;
        reasoning_step.observation = toolResult.output;

        // Track Cypher queries
        if (reasoning_step.action === 'query_graph' && toolResult.success) {
          cypherQueries.push({
            cypher: reasoning_step.actionInput || '',
            explanation: 'Generated via ReAct reasoning',
            confidence: confidence
          });
        }

        // Add sources if successful
        if (toolResult.success && toolResult.output) {
          sources.push(`${reasoning_step.action}: ${reasoning_step.actionInput}`);
        }

        // Add the tool result to conversation
        conversation.push(new AIMessage(`Thought: ${reasoning_step.thought}\nAction: ${reasoning_step.action}\nAction Input: ${reasoning_step.actionInput}`));
        conversation.push(new HumanMessage(`Observation: ${toolResult.output}`));

        currentStep++;
      }

      // If we didn't get a final answer, generate one based on the reasoning
      if (!finalAnswer && reasoning.length > 0) {
        const summaryPrompt = this.buildSummaryPrompt(question, reasoning);
        conversation.push(new HumanMessage(summaryPrompt));
        
        const summaryResponse = await this.llmService.chat(reasoningConfig, conversation);
        finalAnswer = String(summaryResponse.content || '');
        confidence = Math.max(0.3, confidence - 0.2); // Lower confidence for incomplete reasoning
      }

      return {
        answer: finalAnswer || 'I was unable to find a complete answer to your question.',
        reasoning: includeReasoning ? reasoning : [],
        confidence,
        sources: Array.from(new Set(sources)), // Remove duplicates
        cypherQueries
      };

    } catch (error) {
      throw new Error(`ReAct processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build the ReAct system prompt with chat history context
   */
  private buildReActSystemPrompt(strictMode: boolean): string {
    const prompt = `You are an expert code analyst using a ReAct (Reasoning + Acting) approach to answer questions about a codebase.

You have access to the following tools:
1. query_graph: Query the code knowledge graph using natural language
2. get_code: Retrieve the source code content of a specific file
3. search_files: Search for files matching a pattern or containing specific text
4. final_answer: Provide the final answer to the user's question

IMPORTANT INSTRUCTIONS:
- You have access to the conversation history above, so you can reference previous questions and answers
- Think step by step and provide your reasoning in the "thought" field
- Choose the appropriate action from the available tools (ONLY: query_graph, get_code, search_files, or final_answer)
- Provide the necessary input for the chosen action
- Use the tools to gather information before providing final answers
- Be precise and thorough in your analysis
- Cite specific files and code snippets when possible
- If the user refers to something from the conversation history, use that context

${strictMode ? 'STRICT MODE: Only use exact matches and precise queries.' : 'FLEXIBLE MODE: Use heuristic matching when exact matches fail.'}

You must respond with a structured output containing:
- thought: Your reasoning process for this step
- action: The tool you want to use (MUST be one of: query_graph, get_code, search_files, or final_answer)
- actionInput: The input for the chosen tool

When providing a final_answer, make sure to give a complete, comprehensive response in the actionInput field.

CRITICAL: The action field must be exactly one of these four values: query_graph, get_code, search_files, or final_answer.`;

    return prompt;
  }

  /**
   * Parse a reasoning step from LLM response
   */
  private parseReasoningStep(response: string, stepNumber: number): ReActStep {
    // Normalize the response to handle different line endings and whitespace
    const normalizedResponse = response.replace(/\r\n/g, '\n').trim();
    
    // More robust regex patterns that handle various formats
    const thoughtMatch = normalizedResponse.match(/Thought:\s*(.*?)(?=\nAction:|$)/);
    const actionMatch = normalizedResponse.match(/Action:\s*(.*?)(?=\nAction Input:|$)/);
    const actionInputMatch = normalizedResponse.match(/Action Input:\s*([\s\S]*?)(?=\nThought:|$)/);

    let action = actionMatch ? actionMatch[1].trim() : '';
    
    // Normalize action names to handle variations
    if (action) {
      action = action.toLowerCase().replace(/[^a-z_]/g, '');
      
      // Map common variations to expected actions
      const actionMap: Record<string, string> = {
        'querygraph': 'query_graph',
        'query_graph': 'query_graph',
        'getcode': 'get_code',
        'get_code': 'get_code',
        'searchfiles': 'search_files',
        'search_files': 'search_files',
        'finalanswer': 'final_answer',
        'final_answer': 'final_answer',
        'answer': 'final_answer',
        'respond': 'final_answer'
      };
      
      action = actionMap[action] || action;
    }

    return {
      step: stepNumber,
      thought: thoughtMatch ? thoughtMatch[1].trim() : 'No thought provided',
      action: action || 'unknown',
      actionInput: actionInputMatch ? actionInputMatch[1].trim() : ''
    };
  }

  /**
   * Execute an action and return the result
   */
  private async executeAction(action: string, input: string, llmConfig: LLMConfig): Promise<ReActToolResult> {
    try {
      let output = '';
      let success = false;

      // Normalize action name for case-insensitive matching
      const normalizedAction = action.toLowerCase().trim();

      switch (normalizedAction) {
        case 'query_graph':
          if (!this.context) {
            throw new Error('Context not set');
          }
          
          try {
            const cypherQuery = await this.cypherGenerator.generateQuery(input, llmConfig, {
              maxRetries: 3
            });
            
            // Add LIMIT if not present to prevent JSON truncation issues
            let finalCypher = cypherQuery.cypher;
            if (!finalCypher.toLowerCase().includes('limit')) {
              finalCypher += ' LIMIT 20';
            }
            
            // Execute the query
            const results = await this.executeGraphQuery(finalCypher);
            
            // Truncate large responses to prevent JSON parsing issues
            if (results.rows && results.rows.length > 20) {
              results.rows = results.rows.slice(0, 20);
              results.rowCount = 20;
              results.truncated = true;
              results.summary += ' (showing first 20 results)';
            }
            
            output = JSON.stringify(results, null, 2);
            success = true;
          } catch (error) {
            output = `Error generating or executing query: ${error instanceof Error ? error.message : 'Unknown error'}`;
            success = false;
          }
          break;

        case 'get_code':
          if (!this.context) {
            throw new Error('Context not set');
          }
          
          const content = this.context.fileContents.get(input);
          if (content) {
            output = content;
            success = true;
          } else {
            output = `File not found: ${input}`;
            success = false;
          }
          break;

        case 'search_files':
          if (!this.context) {
            throw new Error('Context not set');
          }
          
          const matchingFiles = Array.from(this.context.fileContents.keys())
            .filter(file => file.toLowerCase().includes(input.toLowerCase()))
            .slice(0, 10); // Limit results
          
          output = JSON.stringify(matchingFiles, null, 2);
          success = true;
          break;

        case 'final_answer':
          output = input;
          success = true;
          break;

        case 'unknown':
        case '':
          output = `No action specified. Available actions: query_graph, get_code, search_files, final_answer`;
          success = false;
          break;

        default:
          output = `Unknown action: "${action}". Available actions: query_graph, get_code, search_files, final_answer`;
          success = false;
      }

      return {
        toolName: action,
        input,
        output,
        success
      };
    } catch (error) {
      return {
        toolName: action,
        input,
        output: `Error executing action: ${error instanceof Error ? error.message : 'Unknown error'}`,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Execute a graph query using KuzuDB if available, fallback to JSON graph
   */
  private async executeGraphQuery(cypher: string): Promise<any> {
    console.log('🔍 ReActAgent executing Cypher query:', cypher);
    
    // Try to get KuzuQueryEngine from DualWriteKnowledgeGraph
    if (this.graph && 'getKuzuGraph' in this.graph) {
      const kuzuGraph = (this.graph as any).getKuzuGraph();
      if (kuzuGraph && 'executeQuery' in kuzuGraph) {
        try {
          console.log('🚀 Using KuzuDB for query execution');
          const result = await kuzuGraph.executeQuery(cypher);
          
          // Format result for AI consumption
          const formattedResult = {
            success: true,
            source: 'KuzuDB',
            columns: result.columns || [],
            rows: result.rows || [],
            rowCount: result.rowCount || result.rows?.length || 0,
            executionTime: result.executionTime || 0,
            // Add human-readable summary
            summary: `Found ${result.rowCount || result.rows?.length || 0} results in ${result.executionTime || 0}ms`
          };
          
          console.log(`✅ KuzuDB query successful: ${formattedResult.rowCount} rows returned`);
          return formattedResult;
          
        } catch (error) {
          console.error('❌ KuzuDB query failed:', error);
          console.log('🔄 Falling back to JSON graph query');
          
          // Return error info for AI to understand what went wrong
          return {
            success: false,
            source: 'KuzuDB',
            error: error instanceof Error ? error.message : 'Unknown error',
            fallback: 'Attempting JSON graph query...'
          };
        }
      }
    }
    
    // Fallback to JSON graph query
    console.log('📊 Using JSON graph fallback');
    return this.fallbackGraphQuery(cypher);
  }

  /**
   * Fallback graph query using the JSON graph and GraphQueryEngine
   */
  private async fallbackGraphQuery(cypher: string): Promise<any> {
    if (!this.context?.graph) {
      return { 
        nodes: [], 
        relationships: [], 
        message: 'No graph context available',
        success: false,
        source: 'none'
      };
    }
    
    try {
      // Use existing GraphQueryEngine for fallback
      const { GraphQueryEngine } = await import('../core/graph/query-engine.ts');
      const queryEngine = new GraphQueryEngine(this.context.graph);
      
      console.log('📄 Using JSON graph fallback for query execution');
      const result = queryEngine.executeQuery(cypher);
      return {
        nodes: result.nodes,
        relationships: result.relationships,
        data: result.data,
        success: true,
        source: 'JSON'
      };
    } catch (error) {
      console.error('❌ Fallback query failed:', error);
      return { 
        nodes: [], 
        relationships: [], 
        message: 'Query execution failed', 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        source: 'error'
      };
    }
  }

  /**
   * Build summary prompt for incomplete reasoning
   */
  private buildSummaryPrompt(question: string, reasoning: ReActStep[]): string {
    const reasoningText = reasoning.map(step => 
      `Step ${step.step}: ${step.thought}\nAction: ${step.action}\nResult: ${step.observation || 'No result'}`
    ).join('\n\n');

    return `Based on the following reasoning steps, provide a comprehensive answer to the question: "${question}"

Reasoning steps:
${reasoningText}

Please provide a complete answer based on the information gathered.`;
  }
} 
