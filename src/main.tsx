import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import "./index.css";
import "./i18n";
import { router } from "./app/router";
import { installDevHooks } from "./store/devHooks";
import { initPersistence } from "./store/persistence";

// 描画前に保存済みプロジェクトを復元する
initPersistence();

installDevHooks();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
