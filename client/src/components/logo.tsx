
import React from 'react';

export function Logo() {
  return (
    <div className="relative h-8 w-8">
      <img 
        src="/Sparta_Logo.jpg"
        alt="Sparta Logo"
        className="h-full w-full object-contain"
        style={{ imageRendering: 'crisp-edges' }}
      />
    </div>
  );
}
