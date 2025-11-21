import React, { useState } from 'react';

interface ProductTourProps {
  onClose: () => void;
}

const tourSteps = [
  {
    target: '.summary-cards',
    content: "These cards give you an at-a-glance summary of your disputes.",
    position: 'bottom',
  },
  {
    target: '.filter-controls',
    content: "Use these controls to filter, search, and export your disputes.",
    position: 'bottom',
  },
  {
    target: 'tbody tr:first-child',
    content: "Click on any dispute row to see its full details and take action.",
    position: 'bottom',
  },
  {
    target: 'tbody tr:first-child td:last-child button:last-child',
    content: "The 'Details' button opens the AI Assistant, audit trail, and internal notes.",
    position: 'top',
  },
];

export const ProductTour: React.FC<ProductTourProps> = ({ onClose }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = tourSteps[stepIndex];

  const targetElement = document.querySelector(currentStep.target);
  const targetRect = targetElement?.getBoundingClientRect();

  const handleNext = () => {
    if (stepIndex < tourSteps.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      onClose();
    }
  };

  if (!targetRect || targetRect.width === 0) return null; // Don't render if target not found or hidden

  const tooltipStyle: React.CSSProperties = {
    position: 'absolute',
    top: currentStep.position === 'bottom' ? `${targetRect.bottom + 10}px` : undefined,
    bottom: currentStep.position === 'top' ? `${window.innerHeight - targetRect.top + 10}px` : undefined,
    left: `${targetRect.left + targetRect.width / 2}px`,
    transform: 'translateX(-50%)',
    width: '300px',
  };

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm"></div>
      
      {/* Spotlight */}
      <div
        className="absolute rounded-lg transition-all duration-300"
        style={{
          top: targetRect.top - 8,
          left: targetRect.left - 8,
          width: targetRect.width + 16,
          height: targetRect.height + 16,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.7)',
        }}
      ></div>

      {/* Tooltip */}
      <div style={tooltipStyle} className="z-10 p-4 bg-slate-800 text-white rounded-lg shadow-2xl border border-slate-700">
        <p className="text-sm">{currentStep.content}</p>
        <div className="flex justify-between items-center mt-4">
          <span className="text-xs text-slate-400">
            {stepIndex + 1} / {tourSteps.length}
          </span>
          <button
            onClick={handleNext}
            className="px-3 py-1 bg-cyan-600 text-white text-sm font-medium rounded-md hover:bg-cyan-700"
          >
            {stepIndex === tourSteps.length - 1 ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};
