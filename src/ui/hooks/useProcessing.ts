import { useState, useCallback } from 'react';
import { IngestionService, type IngestionResult } from '../../services/ingestion.service';

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
    progress: '',
    error: '',
    result: null
  });
  
  const ingestionService = new IngestionService();
  
  const updateState = useCallback((updates: Partial<ProcessingState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);
  
  const processGitHubRepo = useCallback(async (
    url: string, 
    token?: string
  ) => {
    try {
      updateState({
        isProcessing: true,
        progress: 'Starting GitHub repository processing...',
        error: '',
        result: null
      });
      
      console.log('🚀 useProcessing: Starting GitHub processing for:', url);
      
      const result = await ingestionService.processGitHubRepository(url, token);
      
      updateState({
        isProcessing: false,
        progress: '',
        result
      });
      console.log('✅ useProcessing: GitHub processing completed successfully');
    } catch (error) {
      updateState({
        isProcessing: false,
        progress: '',
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      });
      console.error('❌ useProcessing: GitHub processing error:', error);
    }
  }, [ingestionService, updateState]);
  
  const processZipFile = useCallback(async (file: File) => {
    try {
      updateState({
        isProcessing: true,
        progress: 'Starting ZIP file processing...',
        error: '',
        result: null
      });
      
      console.log('🚀 useProcessing: Starting ZIP processing for:', file.name);
      
      const result = await ingestionService.processZipFile(file);
      
      updateState({
        isProcessing: false,
        progress: '',
        result
      });
      console.log('✅ useProcessing: ZIP processing completed successfully');
    } catch (error) {
      updateState({
        isProcessing: false,
        progress: '',
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      });
      console.error('❌ useProcessing: ZIP processing error:', error);
    }
  }, [ingestionService, updateState]);
  
  const clearError = useCallback(() => {
    updateState({ error: '' });
  }, [updateState]);
  
  const clearResult = useCallback(() => {
    updateState({ result: null });
  }, [updateState]);
  
  return {
    state,
    processGitHubRepo,
    processZipFile,
    clearError,
    clearResult
  };
};