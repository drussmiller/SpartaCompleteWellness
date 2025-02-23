import React from "react";

export function Logo() {
  return (
    <div className="relative h-32 w-32">
      <img
        src="/Sparta_Logo.jpg"
        alt="Sparta Logo"
        className="h-full w-full object-contain"
        style={{ imageRendering: "crisp-edges" }}
      />
    </div>
  );
}