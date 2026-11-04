import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
} from "@tanstack/react-router";
import { AppShell } from "./AppShell";
import { ErrorView, NotFoundView } from "./ErrorView";

const rootRoute = createRootRoute({
  component: AppShell,
  errorComponent: ErrorView,
  notFoundComponent: NotFoundView,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/rooms" });
  },
});

const page = <TPath extends string>(
  path: TPath,
  loader: () => Promise<{ default: React.ComponentType }>,
) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path,
    component: lazyRouteComponent(loader),
    errorComponent: ErrorView,
  });

const routeTree = rootRoute.addChildren([
  indexRoute,
  page("/rooms", () => import("@/features/rooms/RoomsPage")),
  page("/members", () => import("@/features/members/MembersPage")),
  page("/rules", () => import("@/features/rules/RulesPage")),
  page("/seating", () => import("@/features/seating/SeatingPage")),
  page("/export", () => import("@/features/export/ExportPage")),
]);

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
