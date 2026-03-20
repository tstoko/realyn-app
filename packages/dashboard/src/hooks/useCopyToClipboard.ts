import { useState, useCallback } from 'react';

interface UseCopyToClipboardReturn {
  copy: (text: string) => Promise<boolean>;
  copied: boolean;
  error: string | null;
}

/**
 * Hook for copying text to clipboard with feedback state
 */
export const useCopyToClipboard = (resetDelay = 2000): UseCopyToClipboardReturn => {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = useCallback(async (text: string): Promise<boolean> => {
    try {
      if (!navigator?.clipboard) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        const success = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        if (!success) {
          throw new Error('Copy command failed');
        }
      } else {
        await navigator.clipboard.writeText(text);
      }
      
      setCopied(true);
      setError(null);
      
      // Reset copied state after delay
      setTimeout(() => {
        setCopied(false);
      }, resetDelay);
      
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to copy';
      setError(errorMessage);
      setCopied(false);
      return false;
    }
  }, [resetDelay]);

  return { copy, copied, error };
};
