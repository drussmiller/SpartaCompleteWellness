import React from "react";

export function Logo() {
  return (
    <div className="relative h-20 w-20">
      <img
        src="/Sparta_Logo.jpg"
        alt="Sparta Logo"
        className="h-full w-full object-contain"
        style={{ imageRendering: "crisp-edges" }}
      />
    </div>
  );
}