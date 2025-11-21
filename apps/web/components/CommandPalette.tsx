import React, { useState, useEffect, useMemo } from 'react';

interface CommandPaletteProps {
  onClose: () => void;
  onNavigate: (view: 'properties' | 'portfolio_analytics' | 'activity_log') => void;
  isAdmin: boolean;
}

interface Action {
  id: string;
  title: string;
  section: string;
  action: () => void;
  adminOnly?: boolean;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ onClose, onNavigate, isAdmin }) => {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const actions: Action[] = useMemo(() => [
    { id: 'nav-prop', title: 'Go to Properties', section: 'Navigation', action: () => onNavigate('properties'), adminOnly: true },
    { id: 'nav-port-analytics', title: 'Go to Portfolio Analytics', section: 'Navigation', action: () => onNavigate('portfolio_analytics'), adminOnly: true },
    { id: 'nav-activity', title: 'Go to Activity Log', section: 'Navigation', action: () => onNavigate('activity_log'), adminOnly: true },
  ], [onNavigate]);

  const filteredActions = useMemo(() => {
    const availableActions = isAdmin ? actions : actions.filter(a => !a.adminOnly);
    if (!search) {
      return availableActions;
    }
    return availableActions.filter(
      (action) =>
        action.title.toLowerCase().includes(search.toLowerCase()) ||
        action.section.toLowerCase().includes(search.toLowerCase())
    );
  }, [search, actions, isAdmin]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredActions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredActions.length) % filteredActions.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selectedAction = filteredActions[selectedIndex];
        if (selectedAction) {
          selectedAction.action();
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredActions, selectedIndex, onClose]);

  const groupedActions = useMemo(() => {
    const groups: Record<string, Action[]> = {};
    filteredActions.forEach(action => {
      if (!groups[action.section]) {
        groups[action.section] = [];
      }
      groups[action.section].push(action);
    });
    return groups;
  }, [filteredActions]);

  return (
    <div className="fixed z-50 inset-0 overflow-y-auto" role="dialog" aria-modal="true">
      <div className="flex items-start justify-center min-h-screen pt-20 px-4 text-center">
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm" aria-hidden="true" onClick={onClose}></div>
        <div className="relative inline-block align-bottom bg-slate-900 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-xl sm:w-full border border-slate-700">
          <div className="p-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              placeholder="Search for actions or navigate..."
              className="w-full bg-transparent text-slate-50 placeholder-slate-500 focus:outline-none px-3 py-2 text-lg"
            />
          </div>
          <div className="border-t border-slate-800 max-h-96 overflow-y-auto">
            {Object.entries(groupedActions).map(([section, actions], sectionIndex) => (
              <div key={section}>
                <h3 className="text-xs font-semibold text-slate-400 uppercase px-4 py-2">{section}</h3>
                <ul>
                  {(actions as Action[]).map((action, actionIndex) => {
                    const globalIndex = Object.values(groupedActions).slice(0, sectionIndex).flat().length + actionIndex;
                    return (
                      <li
                        key={action.id}
                        onClick={action.action}
                        className={`px-4 py-2.5 text-sm cursor-pointer ${
                          selectedIndex === globalIndex ? 'bg-cyan-600 text-white' : 'text-slate-300'
                        }`}
                      >
                        {action.title}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {filteredActions.length === 0 && (
              <p className="text-center text-slate-400 py-10">No results found.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};