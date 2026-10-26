import { createRootRoute, Outlet } from "@tanstack/react-router";
import { NoExiste } from "../components/no-existe";

export const Route = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: NoExiste,
});
