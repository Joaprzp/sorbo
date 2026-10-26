import { createFileRoute } from "@tanstack/react-router";
import { Numeros } from "../components/numeros";

export const Route = createFileRoute("/jujuy_/numeros")({
  component: Numeros,
});
