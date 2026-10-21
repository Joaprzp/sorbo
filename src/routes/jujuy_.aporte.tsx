import { createFileRoute } from "@tanstack/react-router";
import { Aporte } from "../components/aporte";

export const Route = createFileRoute("/jujuy_/aporte")({
  validateSearch: (search: Record<string, unknown>) => ({
    t: typeof search.t === "string" ? search.t : "",
  }),
  component: function AporteRoute() {
    const { t } = Route.useSearch();
    return <Aporte token={t} />;
  },
});
