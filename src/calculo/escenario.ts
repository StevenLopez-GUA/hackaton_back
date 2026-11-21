// PERSONA B. Escenario: recalcula el consolidado con tasas editadas, correcciones e IC aceptadas.
// Nunca guarda (no llama setDataset): trabaja sobre copias.
import Decimal from "../decimal";
import { convertir } from "../monedas";
import { obtenerAlertas } from "../pipeline";
import { VERSIONES, type Consolidado, type Dataset, type TipoTasa, type Version } from "../types";
import { corregir } from "../validador/corregir";
import { calcular } from "./consolidar";

export class ErrorEntrada extends Error {
  constructor(public codigo: string, mensaje: string) {
    super(mensaje);
  }
}

export type ResultadoEscenario = {
  consolidado: Consolidado;
  escenario: { correccionesAplicadas: string[]; icAceptadas: string[]; tasasEditadas: string[] };
};

const TIPOS_TASA: TipoTasa[] = ["cierre", "promedio", "presupuesto"];
const esListaTexto = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

function editarTasas(dataset: Dataset, entrada: unknown): { tasas: Dataset["tasas"]; editadas: string[] } {
  const tasas = { ...dataset.tasas };
  const editadas: string[] = [];
  if (entrada === undefined) return { tasas, editadas };
  if (typeof entrada !== "object" || entrada === null) throw new ErrorEntrada("TASAS_INVALIDAS", "tasas debe ser un objeto");
  for (const [moneda, porTipo] of Object.entries(entrada)) {
    // ponytail: solo monedas que ya tienen tasa; agregar una moneda nueva (p. ej. NIO) pediría las 3 tasas.
    if (!tasas[moneda]) throw new ErrorEntrada("TASAS_INVALIDAS", `Moneda sin tasas en el dataset: ${moneda}`);
    if (typeof porTipo !== "object" || porTipo === null) throw new ErrorEntrada("TASAS_INVALIDAS", `tasas.${moneda} debe ser un objeto`);
    tasas[moneda] = { ...tasas[moneda] };
    for (const [tipo, valor] of Object.entries(porTipo)) {
      if (!TIPOS_TASA.includes(tipo as TipoTasa)) throw new ErrorEntrada("TASAS_INVALIDAS", `Tipo de tasa inválido: ${tipo}`);
      let d: Decimal;
      try {
        d = new Decimal(String(valor));
      } catch {
        throw new ErrorEntrada("TASAS_INVALIDAS", `Tasa inválida en ${moneda}.${tipo}`);
      }
      if (!d.isFinite() || d.lte(0)) throw new ErrorEntrada("TASAS_INVALIDAS", `Tasa inválida en ${moneda}.${tipo}`);
      tasas[moneda][tipo as TipoTasa] = d;
      editadas.push(`${moneda}.${tipo}`);
    }
  }
  return { tasas, editadas };
}

export function simularEscenario(actual: Dataset, body: unknown): ResultadoEscenario {
  const b = (body ?? {}) as Record<string, unknown>;
  const version = (b.version ?? "real_2025") as Version;
  if (!VERSIONES.includes(version)) throw new ErrorEntrada("VERSION_INVALIDA", `version debe ser una de: ${VERSIONES.join(", ")}`);
  const pedidas = b.aplicarCorrecciones ?? [];
  if (pedidas !== "todas" && !esListaTexto(pedidas)) {
    throw new ErrorEntrada("CORRECCIONES_INVALIDAS", 'aplicarCorrecciones debe ser "todas" o una lista de IDs de alerta');
  }
  const aceptarIC = b.aceptarIC ?? [];
  if (!esListaTexto(aceptarIC)) throw new ErrorEntrada("IC_INVALIDAS", 'aceptarIC debe ser una lista de referencias ("IC-2025-05")');

  // 1. Tasas editadas y reconversión.
  const { tasas, editadas } = editarTasas(actual, b.tasas);
  let dataset: Dataset = { ...actual, tasas, registros: convertir(actual.registros, tasas) };

  // 2. Correcciones en orden. Los IDs son los del dataset actual; corregir() actúa por filaIds.
  const alertasActuales = obtenerAlertas(actual);
  const elegidas =
    pedidas === "todas"
      ? alertasActuales.filter((a) => corregir(actual, a) !== null)
      : pedidas.map((id) => {
          const a = alertasActuales.find((x) => x.id === id);
          if (!a) throw new ErrorEntrada("ALERTA_DESCONOCIDA", `No existe la alerta ${id}`);
          return a;
        });
  const aplicadas: string[] = [];
  for (const a of elegidas) {
    const c = corregir(dataset, a);
    if (!c) {
      throw new ErrorEntrada(
        "SIN_CORRECCION",
        `La alerta ${a.id} (${a.regla}) no tiene corrección automática${a.regla === "intercompania" ? "; use aceptarIC con su referencia" : ""}`,
      );
    }
    dataset = c.dataset;
    aplicadas.push(a.id);
  }

  // 3. Alertas del nuevo dataset, sin las IC aceptadas, y cálculo con compuerta.
  const aceptadas = new Set(aceptarIC);
  const alertas = obtenerAlertas(dataset).filter((a) => !(a.regla === "intercompania" && a.referencia && aceptadas.has(a.referencia)));
  return {
    consolidado: calcular(dataset, version, alertas),
    escenario: { correccionesAplicadas: aplicadas, icAceptadas: aceptarIC, tasasEditadas: editadas },
  };
}
