
import React from 'react';

export function Logo() {
  return (
    <div className="relative h-8 w-8">
      <img 
        src="/attached_assets/Sparta_Logo.jpg"
        alt="Sparta Logo"
        className="h-full w-full object-contain"
        style={{ imageRendering: 'auto' }}
      />
    </div>
  );
}
