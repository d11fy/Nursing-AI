import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

import { applyTheme, readTheme } from "./context/ThemeContext";
const theme = readTheme();
applyTheme(theme.mode, theme.accent);

const rootElement = document.getElementById("root");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
