import type { MailData, MailKind, RecompensaMail } from "./ports";
import { ars } from "../../src/lib/format";

const MAIL: Record<MailKind, { subject: string; titulo: string; cuerpo: string }> = {
  acreditacion: {
    subject: "Tu contribución a Sorbo Jujuy se acreditó",
    titulo: "Acreditado.",
    cuerpo: "Tu aporte ya suma a la campaña de Jujuy.",
  },
  devolucion: {
    subject: "Te devolvimos tu contribución a Sorbo Jujuy",
    titulo: "Devuelto.",
    cuerpo: "Tu aporte volvió a tu medio de pago.",
  },
  meta_cumplida: {
    subject: "Se cumplió la meta de Jujuy",
    titulo: "Meta cumplida.",
    cuerpo:
      "Juntamos lo que faltaba. El próximo Sorbo es en Jujuy — y es tuyo también.",
  },
  apertura: {
    subject: "Abre Sorbo Jujuy",
    titulo: "Abrimos.",
    cuerpo: "Sorbo Jujuy ya tiene fecha.",
  },
  vence_pronto: {
    subject: "Tus cafés de Sorbo Jujuy vencen en 30 días",
    titulo: "Quedan 30 días.",
    cuerpo: "Tus cafés de la campaña vencen pronto.",
  },
};

export const MAIL_SUBJECTS: Record<MailKind, string> = Object.fromEntries(
  Object.entries(MAIL).map(([k, v]) => [k, v.subject]),
) as Record<MailKind, string>;

// Hex literales: los clientes de mail no evalúan CSS ni tokens oklch.
const AZUL = "#0D34E9";
const NIEVE = "#FBFBFA";
const AZUL_80 = "rgba(13,52,233,0.8)";
const AZUL_40 = "rgba(13,52,233,0.4)";

const mono =
  "font-family: ui-monospace, 'Geist Mono', Menlo, monospace; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase;";

const fecha = (ms: number) =>
  new Date(ms).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
const cafes = (n: number) => (n === 1 ? "1 café" : `${n} cafés`);

// La línea que explica la recompensa, según el mail y el estado del saldo.
function lineaRecompensa(kind: MailKind, r: RecompensaMail): string {
  if (kind === "devolucion") {
    return r.saldo > 0
      ? `La recompensa de este aporte se anuló. Te quedan ${cafes(r.saldo)}.`
      : "La recompensa de este aporte se anuló.";
  }
  if (kind === "apertura" && r.aperturaAt !== undefined && r.venceAt !== undefined) {
    return `Abrimos el ${fecha(r.aperturaAt)}. Tenés ${cafes(r.saldo)} hasta el ${fecha(r.venceAt)}.`;
  }
  if (kind === "vence_pronto" && r.venceAt !== undefined) {
    return `Tus ${cafes(r.saldo)} vencen el ${fecha(r.venceAt)}.`;
  }
  if (r.estado === "activo" && r.venceAt !== undefined) {
    return `Tenés ${cafes(r.saldo)} para canjear hasta el ${fecha(r.venceAt)}.`;
  }
  return `Tu aporte vuelve en café: ${cafes(r.saldo)}. Se activan cuando se cumpla la meta y abra el local.`;
}

// La devolución nunca lleva código ni QR: no se manda un derecho que se anuló.
const conCodigo = (kind: MailKind, r?: RecompensaMail): r is RecompensaMail =>
  !!r && kind !== "devolucion" && r.saldo > 0;

export function mailHtml(kind: MailKind, data: MailData, baseUrl: string): string {
  const campania = `${baseUrl}/jujuy`;
  const r = data.recompensa;
  const fila = (etiqueta: string, valor: string) => `<tr>
        <td style="${mono} color:${AZUL_80}; padding: 12px 0; border-top: 1px solid ${AZUL_40};">${etiqueta}</td>
        <td style="${mono} color:${AZUL}; padding: 12px 0; border-top: 1px solid ${AZUL_40}; text-align: right;">${valor}</td>
      </tr>`;
  const monto = data.montoCentavos !== undefined ? fila("Monto", ars(data.montoCentavos)) : "";
  const recompensa = r
    ? `<tr><td colspan="2" style="${mono} color:${AZUL_80}; padding: 24px 0 12px; line-height:2;">${lineaRecompensa(kind, r)}</td></tr>`
    : "";
  const codigo = conCodigo(kind, r)
    ? `${fila("Código", r.codigo)}
    <tr>
      <td colspan="2" style="padding: 24px 0 0;">
        <img src="${baseUrl}/qr/${r.qrId}.gif" width="168" height="168" alt="QR de tus cafés" style="display:block; width:168px; height:168px;">
        <p style="${mono} color:${AZUL_80}; margin:12px 0 0;">Mostrá el QR o el código en la barra.</p>
      </td>
    </tr>`
    : "";
  const boton = conCodigo(kind, r)
    ? { href: `${baseUrl}/canje/${r.qrId}`, texto: "Ver mis cafés" }
    : { href: campania, texto: "Ver la campaña" };
  return `<!doctype html>
<html lang="es">
<body style="margin:0; padding:24px; background:${NIEVE};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; margin:0 auto; background:${NIEVE}; color:${AZUL}; font-family:Archivo,Arial,Helvetica,sans-serif;">
    <tr>
      <td style="${mono} color:${AZUL}; padding-bottom:8px; border-bottom:1px solid ${AZUL_40}; font-weight:bold;">Sorbo</td>
      <td style="${mono} color:${AZUL_80}; padding-bottom:8px; border-bottom:1px solid ${AZUL_40}; text-align:right;">Jujuy</td>
    </tr>
    <tr>
      <td colspan="2" style="padding:40px 0 0;">
        <h1 style="margin:0; font-family:Archivo,Arial,Helvetica,sans-serif; font-size:34px; line-height:1; font-weight:bold; text-transform:uppercase; color:${AZUL};">${MAIL[kind].titulo}</h1>
        <p style="${mono} color:${AZUL_80}; margin:20px 0 0; line-height:2;">${MAIL[kind].cuerpo}</p>
      </td>
    </tr>
    ${monto}
    ${recompensa}
    ${codigo}
    <tr>
      <td colspan="2" style="padding-top:32px; padding-bottom:56px;">
        <a href="${boton.href}" style="display:inline-block; background:${AZUL}; color:${NIEVE}; ${mono} padding:12px 24px; text-decoration:none; font-weight:bold;">${boton.texto}</a>
      </td>
    </tr>
    <tr>
      <td colspan="2" style="${mono} color:${AZUL_80}; padding-top:16px; border-top:1px solid ${AZUL_40};">
        Dean Funes 244, Salta &nbsp;·&nbsp; @sorbolabs
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function mailText(kind: MailKind, data: MailData, baseUrl: string): string {
  const r = data.recompensa;
  const partes = [MAIL[kind].titulo, MAIL[kind].cuerpo];
  if (data.montoCentavos !== undefined) partes.push(`Monto: ${ars(data.montoCentavos)}`);
  if (r) partes.push(lineaRecompensa(kind, r));
  if (conCodigo(kind, r)) {
    partes.push(`Código: ${r.codigo}`, `Tus cafés: ${baseUrl}/canje/${r.qrId}`);
  } else {
    partes.push(`Campaña: ${baseUrl}/jujuy`);
  }
  partes.push("Sorbo — Dean Funes 244, Salta · @sorbolabs");
  return partes.join("\n\n");
}
