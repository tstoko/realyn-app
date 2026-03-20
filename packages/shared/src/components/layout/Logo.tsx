import React from 'react';

interface LogoProps {
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ 
  className = 'h-16 w-auto'
}) => {
  return (
    <img 
      src="/a44ab499-104a-4c35-9a4f-bf4ea3df265c.png" 
      alt="Realyn Logo" 
      className={className}
    />
  );
};
