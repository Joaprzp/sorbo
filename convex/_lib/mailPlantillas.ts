import type { MailKind } from "./ports";
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

export function mailHtml(
  kind: MailKind,
  data: { montoCentavos?: number },
  baseUrl: string,
): string {
  const campania = `${baseUrl}/jujuy`;
  const monto =
    data.montoCentavos !== undefined
      ? `<tr>
        <td style="${mono} color:${AZUL_80}; padding: 12px 0; border-top: 1px solid ${AZUL_40};">Monto</td>
        <td style="${mono} color:${AZUL}; padding: 12px 0; border-top: 1px solid ${AZUL_40}; text-align: right;">${ars(data.montoCentavos)}</td>
      </tr>`
      : "";
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
    <tr>
      <td colspan="2" style="padding-top:32px; padding-bottom:56px;">
        <a href="${campania}" style="display:inline-block; background:${AZUL}; color:${NIEVE}; ${mono} padding:12px 24px; text-decoration:none; font-weight:bold;">Ver la campaña</a>
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

export function mailText(
  kind: MailKind,
  data: { montoCentavos?: number },
  baseUrl: string,
): string {
  const monto =
    data.montoCentavos !== undefined
      ? `Monto: ${ars(data.montoCentavos)}\n\n`
      : "";
  return `${MAIL[kind].titulo}\n\n${MAIL[kind].cuerpo}\n\n${monto}Campaña: ${baseUrl}/jujuy\n\nSorbo — Dean Funes 244, Salta · @sorbolabs`;
}
