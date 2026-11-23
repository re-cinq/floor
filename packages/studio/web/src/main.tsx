import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import "./theme/fonts.css";
import "./theme/theme.css";
import "./theme/base.css";
import "./theme/lore.css";

const root = document.getElementById("root");

if (!root) throw new Error("index.html has no #root to mount the page in");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
