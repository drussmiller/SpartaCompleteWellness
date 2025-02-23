
import React from "react";

export function Logo() {
  return (
    <div className="relative w-48 h-48">
      <img 
        src="/attached_assets/Sparta_Logo.jpg"
        alt="Sparta Logo"
        className="w-full h-full object-contain"
        style={{ 
          maxWidth: '100%',
          maxHeight: '100%'
        }}
      />
    </div>
  );
}
