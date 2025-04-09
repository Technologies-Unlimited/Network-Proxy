/**
 * Main client entry point for the Network-Proxy application
 * This file initializes the React application with proper providers
 */

import React from "react";
import { createRoot } from "react-dom/client";
import { Provider as JotaiProvider } from "jotai";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { theme } from "../src/themes/default";

/**
 * App component that serves as the main layout for the application
 */
const App: React.FC = () => {
  // Setup for WebSocket connection would go here
  
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <div>
        <h1>Network Proxy</h1>
        <p>Welcome to the Network Proxy application.</p>
        <nav>
          <ul>
            <li><a href="/network-administration">Network Administration</a></li>
            <li><a href="/inventory">Inventory</a></li>
            <li><a href="/tools">Tools</a></li>
          </ul>
        </nav>
      </div>
    </ThemeProvider>
  );
};

/**
 * Initialize the React application
 */
const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <JotaiProvider>
        <App />
      </JotaiProvider>
    </React.StrictMode>
  );
} else {
  console.error("Root element not found!");
} 