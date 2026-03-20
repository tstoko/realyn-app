import React, { useEffect } from 'react';

interface KeyboardShortcutsModalProps {
  onClose: () => void;
}

interface ShortcutItem {
  keys: string[];
  description: string;
  category: string;
}

const shortcuts: ShortcutItem[] = [
  // Navigation
  { keys: ['⌘', 'K'], description: 'Open command palette', category: 'Navigation' },
  { keys: ['?'], description: 'Show keyboard shortcuts', category: 'Navigation' },
  
  // General
  { keys: ['Esc'], description: 'Close modal / Cancel action', category: 'General' },
  { keys: ['↑', '↓'], description: 'Navigate list items', category: 'General' },
  { keys: ['Enter'], description: 'Select / Confirm', category: 'General' },
];

const ShortcutKey: React.FC<{ children: string }> = ({ children }) => (
  <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 text-xs font-medium text-slate-300 bg-slate-800 border border-slate-700 rounded shadow-sm">
    {children}
  </kbd>
);

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ onClose }) => {
  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Group shortcuts by category
  const groupedShortcuts = shortcuts.reduce((acc, shortcut) => {
    if (!acc[shortcut.category]) {
      acc[shortcut.category] = [];
    }
    acc[shortcut.category].push(shortcut);
    return acc;
  }, {} as Record<string, ShortcutItem[]>);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm" 
        aria-hidden="true" 
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-md bg-slate-900 rounded-xl border border-slate-700 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
            <h2 id="shortcuts-title" className="text-lg font-semibold text-slate-100 font-heading">
              Keyboard Shortcuts
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Content */}
          <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
            {Object.entries(groupedShortcuts).map(([category, items]) => (
              <div key={category} className="mb-5 last:mb-0">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                  {category}
                </h3>
                <div className="space-y-2">
                  {items.map((shortcut, index) => (
                    <div 
                      key={index} 
                      className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-800/50 transition-colors"
                    >
                      <span className="text-sm text-slate-300">{shortcut.description}</span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, keyIndex) => (
                          <React.Fragment key={keyIndex}>
                            <ShortcutKey>{key}</ShortcutKey>
                            {keyIndex < shortcut.keys.length - 1 && (
                              <span className="text-slate-600 text-xs mx-0.5">+</span>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          
          {/* Footer */}
          <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/50 rounded-b-xl">
            <p className="text-xs text-slate-500 text-center">
              Press <ShortcutKey>Esc</ShortcutKey> to close
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
