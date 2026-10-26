import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "expiracion-mp",
  { minutes: 10 },
  internal.contributionsInternal.barrerExpiracionMp,
  {},
);

crons.interval(
  "escanear-crypto",
  { minutes: 5 },
  internal.contributionsInternal.escanearCrypto,
  {},
);

crons.daily(
  "devoluciones-89d",
  { hourUTC: 10, minuteUTC: 0 },
  internal.contributionsInternal.devolucionesDiarias,
  {},
);

crons.interval(
  "reembolsos-estancados",
  { hours: 3 },
  internal.contributionsInternal.barrerReembolsos,
  {},
);

crons.daily(
  "vencimiento-recompensas",
  { hourUTC: 13, minuteUTC: 0 },
  internal.recompensas.avisarVencimientos,
  {},
);

export default crons;
