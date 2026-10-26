import { createFileRoute } from "@tanstack/react-router";
import { Staff } from "../components/staff";

export const Route = createFileRoute("/staff")({
  component: Staff,
});
