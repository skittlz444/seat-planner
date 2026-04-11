import React from "react";
import ReactDOM from "react-dom/client";
import { polyfill } from "mobile-drag-drop";
import { scrollBehaviourDragImageTranslateOverride } from "mobile-drag-drop/scroll-behaviour";
import App from "./App";
import "./index.css";

// Enable HTML5 drag-and-drop on touch devices
polyfill({
  dragImageTranslateOverride: scrollBehaviourDragImageTranslateOverride,
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
