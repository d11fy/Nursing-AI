import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

const storedTheme = localStorage.getItem("nursing_theme");
document.documentElement.classList.toggle(
  "dark",
  storedTheme === "dark" ||
    (!storedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches),
);

const rootElement = document.getElementById("root");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
