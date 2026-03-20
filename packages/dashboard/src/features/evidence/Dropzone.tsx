
import React, { useState, DragEvent } from 'react';

interface DropzoneProps {
  label: string;
  files: File[];
  onFilesChange: (files: File[]) => void;
  multiple?: boolean;
}

export const Dropzone: React.FC<DropzoneProps> = ({ label, files, onFilesChange, multiple = false }) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      const newFiles = multiple ? [...files, ...droppedFiles] : [droppedFiles[0]];
      onFilesChange(newFiles);
      e.dataTransfer.clearData();
    }
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
        const selectedFiles = Array.from(e.target.files);
        const newFiles = multiple ? [...files, ...selectedFiles] : [selectedFiles[0]];
        onFilesChange(newFiles);
    }
  };
  
  const handleRemove = (e: React.MouseEvent<HTMLButtonElement>, indexToRemove: number) => {
    e.stopPropagation();
    onFilesChange(files.filter((_, index) => index !== indexToRemove));
  }
  
  const uniqueId = `file-upload-${label.replace(/\s+/g, '-')}`;

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">{label}</label>
      {files.length > 0 && (
          <div className="mt-2 space-y-2">
              {files.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="flex items-center justify-between bg-gray-50 dark:bg-slate-700 p-2 rounded-md text-sm">
                       <div className="flex-1 overflow-hidden">
                          <p className="font-medium text-gray-900 dark:text-slate-200 truncate">{file.name}</p>
                          <p className="text-gray-500 dark:text-slate-400">{(file.size / 1024).toFixed(2)} KB</p>
                       </div>
                       <button onClick={(e) => handleRemove(e, index)} className="ml-4 text-red-600 hover:text-red-800 dark:text-red-500 dark:hover:text-red-400 font-semibold p-1 rounded-full hover:bg-red-100 dark:hover:bg-red-900/50 flex-shrink-0">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                       </button>
                  </div>
              ))}
          </div>
      )}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`mt-2 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 dark:border-slate-600 border-dashed rounded-md transition-colors duration-200 ${isDragOver ? 'border-brand-primary bg-indigo-50 dark:bg-slate-700/50' : 'dark:hover:border-slate-500'}`}
      >
        <div className="space-y-1 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-slate-500" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
              <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="flex text-sm text-gray-600 dark:text-slate-400">
              <label htmlFor={uniqueId} className="relative cursor-pointer bg-white dark:bg-slate-800 rounded-md font-medium text-brand-primary hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-brand-primary dark:focus-within:ring-offset-slate-800">
                <span>Upload {multiple ? 'files' : 'a file'}</span>
                <input id={uniqueId} name={uniqueId} type="file" className="sr-only" onChange={handleFileChange} multiple={multiple} />
              </label>
              <p className="pl-1">or drag and drop</p>
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-500">PNG, JPG, PDF up to 10MB</p>
        </div>
      </div>
    </div>
  );
};
