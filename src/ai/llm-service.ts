import { ChatOpenAI } from '@langchain/openai';
import { AzureChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import type { BaseMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage } from '@langchain/core/messages';

export type LLMProvider = 'openai' | 'azure-openai' | 'anthropic' | 'gemini';

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  maxRetries?: number;
  // Azure OpenAI specific fields
  azureOpenAIEndpoint?: string;
  azureOpenAIApiVersion?: string;
  azureOpenAIDeploymentName?: string;
}

export interface ChatResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model?: string;
  finishReason?: string;
}

export class LLMService {
  private models: Map<string, BaseChatModel> = new Map();
  private defaultConfig: Partial<LLMConfig> = {
    temperature: 0.1,
    maxTokens: 4000,
    maxRetries: 3,
    azureOpenAIApiVersion: '2024-02-01' // Default Azure OpenAI API version
  };

  // Default models for each provider
  private static readonly DEFAULT_MODELS: Record<LLMProvider, string> = {
    openai: 'gpt-4o-mini',
    'azure-openai': 'gpt-4o-mini',
    anthropic: 'claude-3-haiku-20240307',
    gemini: 'gemini-2.5-flash'  // Use the latest 2.5 Flash model as default (2025)
  };

  constructor() {}

  /**
   * Get the chat model instance for tool binding
   */
  public getModel(config: LLMConfig): BaseChatModel {
    return this.getChatModel(config);
  }

  /**
   * Initialize or get a chat model for the specified provider
   */
  public getChatModel(config: LLMConfig): any {
    const cacheKey = this.getCacheKey(config);
    
    if (this.models.has(cacheKey)) {
      return this.models.get(cacheKey)!;
    }

    const model = this.createChatModel(config);
    this.models.set(cacheKey, model);
    return model;
  }

  /**
   * Send a chat message and get a response
   */
  public async chat(
    config: LLMConfig,
    messages: BaseMessage[],
    options?: { stream?: boolean }
  ): Promise<ChatResponse> {
    try {
      const model = this.getChatModel(config);
      
      if (options?.stream) {
        // For streaming, we'd need to handle this differently
        // For now, we'll just use regular invoke
        console.warn('Streaming not implemented yet, falling back to regular invoke');
      }

      const response = await model.invoke(messages);
      
      return {
        content: response.content as string,
        usage: response.response_metadata?.usage ? {
          promptTokens: response.response_metadata.usage.prompt_tokens || 0,
          completionTokens: response.response_metadata.usage.completion_tokens || 0,
          totalTokens: response.response_metadata.usage.total_tokens || 0
        } : undefined,
        model: config.model || LLMService.DEFAULT_MODELS[config.provider],
        finishReason: response.response_metadata?.finish_reason
      };
    } catch (error) {
      throw new Error(`LLM chat failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate API key format for different providers
   */
  public validateApiKey(provider: LLMProvider, apiKey: string): boolean {
    if (!apiKey || apiKey.trim().length === 0) {
      return false;
    }

    switch (provider) {
      case 'openai':
        return apiKey.startsWith('sk-') && apiKey.length > 20;
      case 'azure-openai':
        // Azure OpenAI keys are typically 32 characters long and don't have a specific prefix
        return apiKey.length >= 20; // More flexible validation for Azure keys
      case 'anthropic':
        return apiKey.startsWith('sk-ant-') && apiKey.length > 20;
      case 'gemini':
        return apiKey.length > 20; // Google API keys don't have a consistent prefix
      default:
        return false;
    }
  }

  /**
   * Validate Azure OpenAI configuration
   */
  public validateAzureOpenAIConfig(config: LLMConfig): { valid: boolean; error?: string } {
    if (config.provider !== 'azure-openai') {
      return { valid: false, error: 'Provider must be azure-openai' };
    }

    if (!config.azureOpenAIEndpoint) {
      return { valid: false, error: 'Azure OpenAI endpoint is required' };
    }

    if (!config.azureOpenAIEndpoint.includes('openai.azure.com')) {
      return { valid: false, error: 'Invalid Azure OpenAI endpoint format. Should contain "openai.azure.com"' };
    }

    if (!config.azureOpenAIDeploymentName) {
      return { valid: false, error: 'Azure OpenAI deployment name is required' };
    }

    return { valid: true };
  }

  /**
   * Get available models for a provider (static fallback)
   */
  public getAvailableModels(provider: LLMProvider): string[] {
    switch (provider) {
      case 'openai':
        return [
          'gpt-4o',
          'gpt-4o-mini',
          'gpt-4-turbo',
          'gpt-4',
          'gpt-3.5-turbo'
        ];
      case 'azure-openai':
        return [
          'gpt-4o',
          'gpt-4o-mini', 
          'gpt-4.1-mini-v2', // Common deployment name
          'gpt-4-turbo',
          'gpt-4',
          'gpt-35-turbo', // Note: Azure uses gpt-35-turbo instead of gpt-3.5-turbo
          'gpt-4-32k'
        ];
      case 'anthropic':
        return [
          'claude-3-5-sonnet-20241022',
          'claude-3-5-haiku-20241022',
          'claude-3-opus-20240229',
          'claude-3-sonnet-20240229',
          'claude-3-haiku-20240307'
        ];
      case 'gemini':
        return [
          'gemini-2.5-flash',         // Latest and fastest (2025) - NEW DEFAULT
          'gemini-2.5-pro',           // Latest pro model (2025) - PREMIUM
          'gemini-1.5-flash',         // Most stable and widely available
          'gemini-1.5-pro',           // Stable pro model
          'gemini-1.0-pro',           // Legacy but very stable
          'gemini-1.5-flash-8b',      // Smaller, efficient version
          'gemini-2.0-flash',         // Newer model (may not be available to all users)
          'gemini-2.0-flash-lite'     // Lightweight version
        ];
      default:
        return [];
    }
  }

  /**
   * Fetch available models from OpenAI API using user's API key
   */
  public async fetchAvailableModels(provider: LLMProvider, apiKey: string): Promise<string[]> {
    if (!apiKey || !this.validateApiKey(provider, apiKey)) {
      console.warn('Invalid API key, using fallback models');
      return this.getAvailableModels(provider);
    }

    try {
      switch (provider) {
        case 'openai':
          return await this.fetchOpenAIModels(apiKey);
        case 'azure-openai':
          // Azure OpenAI models are deployment-specific, use static list
          return this.getAvailableModels(provider);
        case 'anthropic':
          // Anthropic doesn't have a public models API, use static list
          return this.getAvailableModels(provider);
        case 'gemini':
          // Google Gemini models are predefined, use static list
          return this.getAvailableModels(provider);
        default:
          return this.getAvailableModels(provider);
      }
    } catch (error) {
      console.warn('Failed to fetch models from API, using fallback:', error);
      return this.getAvailableModels(provider);
    }
  }

  /**
   * Fetch models from OpenAI API
   */
  private async fetchOpenAIModels(apiKey: string): Promise<string[]> {
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      
      // Filter for chat models only and sort by relevance
      const chatModels = data.data
        .filter((model: any) => {
          const id = model.id.toLowerCase();
          return (
            id.includes('gpt') && 
            !id.includes('instruct') && 
            !id.includes('edit') &&
            !id.includes('embedding') &&
            !id.includes('whisper') &&
            !id.includes('tts') &&
            !id.includes('dall-e')
          );
        })
        .map((model: any) => model.id)
        .sort((a: string, b: string) => {
          // Sort GPT models by preference: 4o > 4-turbo > 4 > 3.5-turbo
          const getModelPriority = (modelId: string) => {
            if (modelId.includes('4o')) return 1;
            if (modelId.includes('4-turbo')) return 2;
            if (modelId.includes('gpt-4')) return 3;
            if (modelId.includes('3.5-turbo')) return 4;
            return 5;
          };
          return getModelPriority(a) - getModelPriority(b);
        });

      console.log('📡 Fetched OpenAI models:', chatModels);
      return chatModels.length > 0 ? chatModels : this.getAvailableModels('openai');
      
    } catch (error) {
      console.error('Failed to fetch OpenAI models:', error);
      throw error;
    }
  }

  /**
   * Get provider display name
   */
  public getProviderDisplayName(provider: LLMProvider): string {
    switch (provider) {
      case 'openai':
        return 'OpenAI';
      case 'azure-openai':
        return 'Azure OpenAI';
      case 'anthropic':
        return 'Anthropic';
      case 'gemini':
        return 'Google Gemini';
      default:
        return provider;
    }
  }

  /**
   * Test connection with the provider
   */
  public async testConnection(config: LLMConfig): Promise<{ success: boolean; error?: string }> {
    try {
      // Validate Azure OpenAI config if needed
      if (config.provider === 'azure-openai') {
        const validation = this.validateAzureOpenAIConfig(config);
        if (!validation.valid) {
          return {
            success: false,
            error: validation.error
          };
        }
      }

      const model = this.createChatModel(config);
      
      // Send a simple test message
      const testMessages = [
        new HumanMessage("Test connection")
      ];
      
      await model.invoke(testMessages);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection test failed'
      };
    }
  }

  /**
   * Clear cached models (useful for updating API keys)
   */
  public clearCache(): void {
    this.models.clear();
  }

  /**
   * Create a chat model instance based on the provider
   */
  private createChatModel(config: LLMConfig): any {
    const mergedConfig = { ...this.defaultConfig, ...config };
    const model = mergedConfig.model || LLMService.DEFAULT_MODELS[config.provider];

    switch (config.provider) {
      case 'openai':
        return new ChatOpenAI({
          apiKey: config.apiKey,
          model,
          temperature: mergedConfig.temperature,
          maxRetries: mergedConfig.maxRetries,
          timeout: 30000
          // Removed maxTokens - let OpenAI handle token limits automatically
        });

      case 'azure-openai':
        // Debug logging for Azure config
        console.log('🔧 Azure OpenAI Config Debug:', {
          apiKey: config.apiKey ? `${config.apiKey.substring(0, 6)}...` : 'missing',
          endpoint: config.azureOpenAIEndpoint,
          deploymentName: config.azureOpenAIDeploymentName,
          apiVersion: config.azureOpenAIApiVersion,
          instanceName: config.azureOpenAIEndpoint?.replace('https://', '').split('.')[0]
        });

        // Extract instance name from endpoint (remove https:// and .openai.azure.com)
        const instanceName = config.azureOpenAIEndpoint?.replace('https://', '').replace('.openai.azure.com', '') || '';
        
        // Set environment variables as fallback (LangChain sometimes checks these)
        if (typeof process !== 'undefined' && process.env) {
          process.env.AZURE_OPENAI_API_KEY = config.apiKey;
          process.env.AZURE_OPENAI_ENDPOINT = config.azureOpenAIEndpoint;
          process.env.AZURE_OPENAI_API_VERSION = config.azureOpenAIApiVersion;
        }
        
        // Try multiple configuration approaches
        const configs = [
          // Configuration 1: Standard Azure parameters
          {
            apiKey: config.apiKey,
            azureOpenAIApiKey: config.apiKey,
            azureOpenAIEndpoint: config.azureOpenAIEndpoint,
            azureOpenAIApiInstanceName: instanceName,
            azureOpenAIApiDeploymentName: config.azureOpenAIDeploymentName,
            azureOpenAIApiVersion: config.azureOpenAIApiVersion || '2024-02-01',
            temperature: mergedConfig.temperature,
            maxRetries: mergedConfig.maxRetries
            // Removed maxTokens - let Azure OpenAI handle token limits automatically
          },
          // Configuration 2: Alternative parameter names
          {
            openAIApiKey: config.apiKey,
            azureOpenAIApiKey: config.apiKey,
            azureOpenAIEndpoint: config.azureOpenAIEndpoint,
            azureOpenAIApiDeploymentName: config.azureOpenAIDeploymentName,
            azureOpenAIApiVersion: config.azureOpenAIApiVersion || '2024-02-01',
            deploymentName: config.azureOpenAIDeploymentName,
            temperature: mergedConfig.temperature
            // Removed maxTokens - let Azure OpenAI handle token limits automatically
          },
          // Configuration 3: Minimal required parameters
          {
            apiKey: config.apiKey,
            azureOpenAIApiKey: config.apiKey,
            azureOpenAIEndpoint: config.azureOpenAIEndpoint,
            deploymentName: config.azureOpenAIDeploymentName,
            apiVersion: config.azureOpenAIApiVersion || '2024-02-01'
          }
        ];

        let lastError: Error | null = null;
        
        for (let i = 0; i < configs.length; i++) {
          try {
            console.log(`🔄 Trying Azure config approach ${i + 1}:`, {
              hasApiKey: !!configs[i].apiKey || !!configs[i].azureOpenAIApiKey || !!configs[i].openAIApiKey,
              endpoint: configs[i].azureOpenAIEndpoint,
              deployment: configs[i].azureOpenAIApiDeploymentName || configs[i].deploymentName
            });
            
            const azureModel = new AzureChatOpenAI(configs[i]);
            console.log('✅ Azure OpenAI model created successfully!');
            return azureModel;
          } catch (error) {
            console.warn(`❌ Config approach ${i + 1} failed:`, error);
            lastError = error as Error;
            continue;
          }
        }
        
        // If all configurations failed, try regular OpenAI as absolute fallback
        console.warn('❌ All Azure OpenAI configurations failed. Trying regular OpenAI as fallback...');
        console.log('🔄 Attempting OpenAI fallback with Azure endpoint...');
        
        try {
          // Last resort: use regular ChatOpenAI with Azure endpoint in custom way
          return new ChatOpenAI({
            openAIApiKey: config.apiKey,
            apiKey: config.apiKey,
            model: config.azureOpenAIDeploymentName,
            temperature: mergedConfig.temperature,
            maxRetries: mergedConfig.maxRetries,
            timeout: 30000
            // Removed maxTokens - let OpenAI handle token limits automatically
          });
        } catch (fallbackError) {
          console.error('❌ OpenAI fallback also failed:', fallbackError);
          throw lastError || new Error('Failed to create any OpenAI model for Azure configuration');
        }

      case 'anthropic':
        return new ChatAnthropic({
          model: config.model || 'claude-3-sonnet-20240229',
          anthropicApiKey: config.apiKey,
          maxTokens: config.maxTokens || 4096,
          temperature: config.temperature || 0.7
        });

      case 'gemini':
        return new ChatGoogleGenerativeAI({
          apiKey: config.apiKey,
          model,
          temperature: mergedConfig.temperature,
          maxOutputTokens: mergedConfig.maxTokens,
          maxRetries: mergedConfig.maxRetries
        });

      default:
        throw new Error(`Unsupported provider: ${config.provider}`);
    }
  }

  /**
   * Generate cache key for model instances
   */
  private getCacheKey(config: LLMConfig): string {
    const model = config.model || LLMService.DEFAULT_MODELS[config.provider];
    let baseKey = `${config.provider}:${model}:${config.apiKey.slice(-8)}:${config.temperature}:${config.maxTokens}`;
    
    // Add Azure OpenAI specific fields to cache key
    if (config.provider === 'azure-openai') {
      baseKey += `:${config.azureOpenAIEndpoint}:${config.azureOpenAIDeploymentName}:${config.azureOpenAIApiVersion}`;
    }
    
    return baseKey;
  }
} 
