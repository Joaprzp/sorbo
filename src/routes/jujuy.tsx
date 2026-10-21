import { createFileRoute } from "@tanstack/react-router";
import { Jujuy } from "../components/jujuy";

export const Route = createFileRoute("/jujuy")({
  component: Jujuy,
});
