import { useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { api } from "../../convex/_generated/api";
import { Pieza } from "./pieza";
import { claveDispositivo, guardarTokenStaff, tokenStaff, useAhora } from "../lib/staffSesion";
import { fechaAR } from "../lib/format";

const campo =
  "mt-2 w-full border-0 border-b border-azul/40 bg-transparent py-2 font-mono text-sm uppercase text-azul placeholder:text-azul/40 focus:border-azul focus:outline-none";
const etiqueta = "block font-mono text-xs uppercase tracking-[0.16em] text-azul/80";
const boton =
  "bg-azul px-7 py-3 text-xs font-semibold uppercase tracking-[0.17em] text-nieve hover:bg-noche disabled:opacity-70";

const errores: Record<string, string> = {
  PIN_INCORRECTO: "PIN incorrecto.",
  PIN_BLOQUEADO: "Bloqueado 15 minutos por intentos fallidos.",
};

function Ingreso({ alEntrar }: { alEntrar: (token: string) => void }) {
  const ingresar = useMutation(api.staff.ingresar);
  const [nombre, setNombre] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const r = await ingresar({ pin, nombre, clave: claveDispositivo() });
      if (r.token) alEntrar(r.token);
      else setError(errores[r.error ?? ""] ?? "No se pudo entrar.");
    } catch {
      setError("El acceso del staff no está disponible.");
    }
    setPin("");
    setEnviando(false);
  };

  return (
    <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-6">
      <div>
        <label htmlFor="nombre" className={etiqueta}>
          Este dispositivo
        </label>
        <input
          id="nombre"
          required
          maxLength={40}
          placeholder="Tablet barra"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className={campo}
        />
      </div>
      <div>
        <label htmlFor="pin" className={etiqueta}>
          PIN
        </label>
        <input
          id="pin"
          required
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className={campo}
        />
      </div>
      <div>
        <button type="submit" disabled={enviando} className={boton}>
          Entrar
        </button>
      </div>
      {error && (
        <p role="alert" className="font-mono text-xs uppercase tracking-[0.14em] text-alerta">
          {error}
        </p>
      )}
    </form>
  );
}

function Buscador({ token, nombre, venceAt, alSalir }: {
  token: string;
  nombre: string;
  venceAt: number;
  alSalir: () => void;
}) {
  const convex = useConvex();
  const navigate = useNavigate();
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const qrId = await convex.query(api.staff.buscarCodigo, { codigo, token });
      if (qrId) await navigate({ to: "/canje/$id", params: { id: qrId } });
      else setError("Ese código no existe.");
    } catch {
      setError("La sesión venció. Volvé a entrar.");
    }
  };

  return (
    <>
      <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-6">
        <div>
          <label htmlFor="codigo" className={etiqueta}>
            Código
          </label>
          <input
            id="codigo"
            required
            autoComplete="off"
            placeholder="JUJ-4F7K9X"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            className={campo}
          />
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-azul/70">
            O escaneá el QR con la cámara.
          </p>
        </div>
        <div>
          <button type="submit" className={boton}>
            Buscar
          </button>
        </div>
        {error && (
          <p role="alert" className="font-mono text-xs uppercase tracking-[0.14em] text-alerta">
            {error}
          </p>
        )}
      </form>
      <div className="mt-12 flex flex-wrap items-baseline justify-between gap-4 border-t border-azul/40 pt-4 font-mono text-[11px] uppercase tracking-[0.16em] text-azul/70">
        <span>
          {nombre} · hasta el {fechaAR(venceAt)}
        </span>
        <button type="button" onClick={alSalir} className="text-azul underline-offset-4 hover:underline">
          Cerrar sesión
        </button>
      </div>
    </>
  );
}

export function Staff() {
  const [token, setToken] = useState(tokenStaff);
  // Sin token guardado no hay nada que validar: el ingreso se muestra ya.
  const consulta = useQuery(api.staff.sesion, token ? { token } : "skip");
  const ahora = useAhora();
  // Vencida en el reloj de la página aunque la consulta no se haya re-corrido.
  const sesion = consulta && consulta.venceAt > ahora ? consulta : consulta === undefined ? undefined : null;
  const salir = () => {
    guardarTokenStaff(null);
    setToken(undefined);
  };
  return (
    <Pieza lado="Staff" doe={false}>
      <section className="py-10">
        <h1 className="text-[clamp(2rem,8vw,6.5rem)] font-bold uppercase leading-[0.98]">Canje.</h1>
        <div className="mt-10">
          {token && sesion === undefined ? null : sesion && token ? (
            <Buscador token={token} nombre={sesion.nombre} venceAt={sesion.venceAt} alSalir={salir} />
          ) : (
            <Ingreso
              alEntrar={(t) => {
                guardarTokenStaff(t);
                setToken(t);
              }}
            />
          )}
        </div>
      </section>
    </Pieza>
  );
}
