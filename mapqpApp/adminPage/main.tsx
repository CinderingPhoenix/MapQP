import React from "react";
import { createRoot } from "react-dom/client";
import Editor from "./editor";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Editor />
  </React.StrictMode>,
);
