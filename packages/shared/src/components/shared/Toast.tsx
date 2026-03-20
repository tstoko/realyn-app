import React, { useState, createContext, useCallback, ReactNode } from 'react';
import { CheckCircleIcon } from '../icons/CheckCircleIcon';
import { ExclamationIcon } from '../icons/ExclamationIcon';

type ToastType = 'success' | 'error' | 'info';

interface ToastMessage {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
}

export const ToastContext = createContext<ToastContextType | undefined>(undefined);

const Toast: React.FC<{ toast: ToastMessage; onDismiss: (id: number) => void }> = ({ toast, onDismiss }) => {
  React.useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, 5000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  const typeStyles = {
    success: { bg: 'bg-green-500', icon: <CheckCircleIcon className="h-6 w-6 text-white" /> },
    error: { bg: 'bg-red-500', icon: <ExclamationIcon className="h-6 w-6 text-white" /> },
    info: { bg: 'bg-cyan-600', icon: <ExclamationIcon className="h-6 w-6 text-white" /> },
  };

  return (
    <div className={`flex items-center p-4 rounded-xl shadow-lg text-white ${typeStyles[toast.type].bg}`}>
      <div className="flex-shrink-0">{typeStyles[toast.type].icon}</div>
      <div className="ml-3 text-sm font-medium">{toast.message}</div>
      <button onClick={() => onDismiss(toast.id)} className="ml-auto -mx-1.5 -my-1.5 p-1.5 rounded-full inline-flex items-center justify-center text-white hover:bg-white/20">
        <span className="sr-only">Dismiss</span>
        <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
      </button>
    </div>
  );
};

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    setToasts((toasts) => [...toasts, { ...toast, id: Date.now() }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((toasts) => toasts.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed top-5 right-5 z-[100] space-y-3 w-full max-w-sm">
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};