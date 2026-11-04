import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import "./index.css";
import "./i18n";
import { router } from "./app/router";
import { initPersistence } from "./store/persistence";

// 描画前に保存済みプロジェクトを復元する
initPersistence();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
