import { useState, useCallback, useEffect } from 'react';
import { isParallelParsingEnabled } from '../../config/features.ts';
import type { LLMProvider } from '../../ai/llm-service';

type ParsingMode = 'single' | 'parallel';

interface SettingsState {
  // Processing settings
  directoryFilter: string;
  fileExtensions: string;
  parsingMode: ParsingMode;
  
  // LLM settings
  llmProvider: LLMProvider;
  openaiApiKey: string;
  azureApiKey: string;
  anthropicApiKey: string;
  geminiApiKey: string;
  azureOpenAIEndpoint: string;
  azureOpenAIDeploymentName: string;
  azureOpenAIApiVersion: string;
  
  // GitHub settings
  githubToken: string;
  
  // UI settings
  showSettings: boolean;
}

interface UseSettingsReturn {
  settings: SettingsState;
  updateSetting: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  updateSettings: (updates: Partial<SettingsState>) => void;
  showSettings: () => void;
  hideSettings: () => void;
  resetSettings: () => void;
  saveSettings: () => void;
  getCurrentProviderApiKey: () => string;
  updateCurrentProviderApiKey: (apiKey: string) => void;
}

const DEFAULT_SETTINGS: SettingsState = {
  // Processing settings
  directoryFilter: 'src,lib,components,pages,utils',
  fileExtensions: '.ts,.tsx,.js,.jsx,.py,.java,.cpp,.c,.cs,.php,.rb,.go,.rs,.swift,.kt,.scala,.clj,.hs,.ml,.fs,.elm,.dart,.lua,.r,.m,.sh,.sql,.html,.css,.scss,.less,.vue,.svelte',
  parsingMode: 'single',
  
  // LLM settings
  llmProvider: 'openai',
  openaiApiKey: '',
  azureApiKey: '',
  anthropicApiKey: '',
  geminiApiKey: '',
  azureOpenAIEndpoint: '',
  azureOpenAIDeploymentName: '',
  azureOpenAIApiVersion: '2024-02-01',
  
  // GitHub settings
  githubToken: '',
  
  // UI settings
  showSettings: false
};

/**
 * Custom hook for managing application settings
 */
export const useSettings = (): UseSettingsReturn => {
  const [settings, setSettings] = useState<SettingsState>(() => {
    // Load settings from localStorage
    const loadedSettings = { ...DEFAULT_SETTINGS };
    
    try {
      // Handle migration from old single API key to provider-specific keys
      const oldApiKey = localStorage.getItem('llm_api_key');
      const currentProvider = (localStorage.getItem('llm_provider') as LLMProvider) || 'openai';
      
      // Load individual settings from localStorage
      const stored = {
        llmProvider: currentProvider,
        openaiApiKey: localStorage.getItem('openai_api_key') || 
          (currentProvider === 'openai' ? oldApiKey || '' : ''),
        azureApiKey: localStorage.getItem('azure_api_key') || 
          (currentProvider === 'azure-openai' ? oldApiKey || '' : ''),
        anthropicApiKey: localStorage.getItem('anthropic_api_key') || 
          (currentProvider === 'anthropic' ? oldApiKey || '' : ''),
        geminiApiKey: localStorage.getItem('gemini_api_key') || 
          (currentProvider === 'gemini' ? oldApiKey || '' : ''),
        azureOpenAIEndpoint: localStorage.getItem('azure_openai_endpoint') || '',
        azureOpenAIDeploymentName: localStorage.getItem('azure_openai_deployment') || '',
        azureOpenAIApiVersion: localStorage.getItem('azure_openai_api_version') || '2024-02-01',
        githubToken: localStorage.getItem('github_token') || '',
        parsingMode: (isParallelParsingEnabled() ? 'parallel' : 'single') as ParsingMode
      };
      
      // Clean up old API key after migration
      if (oldApiKey) {
        localStorage.removeItem('llm_api_key');
      }
      
      Object.assign(loadedSettings, stored);
    } catch (error) {
      console.warn('Failed to load settings from localStorage:', error);
    }
    
    return loadedSettings;
  });
  
  // Set parsing mode based on feature flags on mount
  useEffect(() => {
    setSettings(prev => ({
      ...prev,
      parsingMode: (isParallelParsingEnabled() ? 'parallel' : 'single') as ParsingMode
    }));
  }, []);
  
  const updateSetting = useCallback(<K extends keyof SettingsState>(
    key: K, 
    value: SettingsState[K]
  ) => {
    setSettings(prev => {
      const newSettings = { ...prev, [key]: value };
      
      // Persist certain settings to localStorage
      try {
        switch (key) {
          case 'llmProvider':
            localStorage.setItem('llm_provider', value as string);
            break;
          case 'openaiApiKey':
            if (value) localStorage.setItem('openai_api_key', value as string);
            else localStorage.removeItem('openai_api_key');
            break;
          case 'azureApiKey':
            if (value) localStorage.setItem('azure_api_key', value as string);
            else localStorage.removeItem('azure_api_key');
            break;
          case 'anthropicApiKey':
            if (value) localStorage.setItem('anthropic_api_key', value as string);
            else localStorage.removeItem('anthropic_api_key');
            break;
          case 'geminiApiKey':
            if (value) localStorage.setItem('gemini_api_key', value as string);
            else localStorage.removeItem('gemini_api_key');
            break;
          case 'azureOpenAIEndpoint':
            if (value) localStorage.setItem('azure_openai_endpoint', value as string);
            break;
          case 'azureOpenAIDeploymentName':
            if (value) localStorage.setItem('azure_openai_deployment', value as string);
            break;
          case 'azureOpenAIApiVersion':
            if (value) localStorage.setItem('azure_openai_api_version', value as string);
            break;
          case 'githubToken':
            if (value) localStorage.setItem('github_token', value as string);
            break;
          case 'parsingMode':
            localStorage.setItem('parsing_mode', value as string);
            break;
        }
      } catch (error) {
        console.warn('Failed to persist setting:', key, error);
      }
      
      return newSettings;
    });
  }, []);
  
  const updateSettings = useCallback((updates: Partial<SettingsState>) => {
    Object.entries(updates).forEach(([key, value]) => {
      updateSetting(key as keyof SettingsState, value);
    });
  }, [updateSetting]);
  
  const showSettings = useCallback(() => {
    updateSetting('showSettings', true);
  }, [updateSetting]);
  
  const hideSettings = useCallback(() => {
    updateSetting('showSettings', false);
  }, [updateSetting]);
  
  const resetSettings = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS });
    
    // Clear localStorage
    try {
      localStorage.removeItem('openai_api_key');
      localStorage.removeItem('azure_api_key');
      localStorage.removeItem('anthropic_api_key');
      localStorage.removeItem('gemini_api_key');
      localStorage.removeItem('llm_provider');
      localStorage.removeItem('azure_openai_endpoint');
      localStorage.removeItem('azure_openai_deployment');
      localStorage.removeItem('azure_openai_api_version');
      localStorage.removeItem('github_token');
      // Also remove old key if it still exists
      localStorage.removeItem('llm_api_key');
    } catch (error) {
      console.warn('Failed to clear settings from localStorage:', error);
    }
    
    // Feature flags are managed via config file, no reset needed
  }, []);
  
  const saveSettings = useCallback(() => {
    // Force save all settings to localStorage
    try {
      if (settings.openaiApiKey) localStorage.setItem('openai_api_key', settings.openaiApiKey);
      if (settings.azureApiKey) localStorage.setItem('azure_api_key', settings.azureApiKey);
      if (settings.anthropicApiKey) localStorage.setItem('anthropic_api_key', settings.anthropicApiKey);
      if (settings.geminiApiKey) localStorage.setItem('gemini_api_key', settings.geminiApiKey);
      localStorage.setItem('llm_provider', settings.llmProvider);
      if (settings.azureOpenAIEndpoint) localStorage.setItem('azure_openai_endpoint', settings.azureOpenAIEndpoint);
      if (settings.azureOpenAIDeploymentName) localStorage.setItem('azure_openai_deployment', settings.azureOpenAIDeploymentName);
      if (settings.azureOpenAIApiVersion) localStorage.setItem('azure_openai_api_version', settings.azureOpenAIApiVersion);
      if (settings.githubToken) localStorage.setItem('github_token', settings.githubToken);
      
      console.log('✅ Settings saved successfully');
    } catch (error) {
      console.error('❌ Failed to save settings:', error);
    }
  }, [settings]);

  const getCurrentProviderApiKey = useCallback((): string => {
    const result = (() => {
      switch (settings.llmProvider) {
        case 'openai':
          return settings.openaiApiKey;
        case 'azure-openai':
          return settings.azureApiKey;
        case 'anthropic':
          return settings.anthropicApiKey;
        case 'gemini':
          return settings.geminiApiKey;
        default:
          return '';
      }
    })();
    
    console.log('🔑 getCurrentProviderApiKey:', {
      provider: settings.llmProvider,
      returnedKey: result ? `${result.substring(0, 6)}...` : 'empty',
      allKeys: {
        openai: settings.openaiApiKey ? `${settings.openaiApiKey.substring(0, 6)}...` : 'empty',
        azure: settings.azureApiKey ? `${settings.azureApiKey.substring(0, 6)}...` : 'empty',
        anthropic: settings.anthropicApiKey ? `${settings.anthropicApiKey.substring(0, 6)}...` : 'empty',
        gemini: settings.geminiApiKey ? `${settings.geminiApiKey.substring(0, 6)}...` : 'empty'
      }
    });
    
    return result;
  }, [settings.llmProvider, settings.openaiApiKey, settings.azureApiKey, settings.anthropicApiKey, settings.geminiApiKey]);

  const updateCurrentProviderApiKey = useCallback((apiKey: string) => {
    switch (settings.llmProvider) {
      case 'openai':
        updateSetting('openaiApiKey', apiKey);
        break;
      case 'azure-openai':
        updateSetting('azureApiKey', apiKey);
        break;
      case 'anthropic':
        updateSetting('anthropicApiKey', apiKey);
        break;
      case 'gemini':
        updateSetting('geminiApiKey', apiKey);
        break;
    }
  }, [settings.llmProvider, updateSetting]);
  
  return {
    settings,
    updateSetting,
    updateSettings,
    showSettings,
    hideSettings,
    resetSettings,
    saveSettings,
    getCurrentProviderApiKey,
    updateCurrentProviderApiKey
  };
};