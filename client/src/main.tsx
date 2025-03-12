
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

console.log('React entry point initializing...');

const rootElement = document.getElementById("root");
if (!rootElement) {
  console.error('Root element not found! Make sure index.html has a div with id="root"');
  throw new Error('Root element not found');
}

try {
  console.log('Creating React root...');
  const root = createRoot(rootElement);
  console.log('Rendering app...');
  root.render(<App />);
  console.log('App mounted successfully');
} catch (error) {
  console.error('Error initializing React app:', error);
  throw error;
}
