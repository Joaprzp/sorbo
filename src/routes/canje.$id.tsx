import { createFileRoute } from "@tanstack/react-router";
import { Canje } from "../components/canje";

export const Route = createFileRoute("/canje/$id")({
  component: function CanjeRoute() {
    const { id } = Route.useParams();
    return <Canje qrId={id} />;
  },
});
