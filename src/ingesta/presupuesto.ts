import type * as XLSX from "xlsx";
import { desdeExcel } from "../decimal";
import type {
  AvisoIngesta,
  CodigoEmpresa,
  Empresa,
  RegistroNormalizado,
  Tipo,
  TipoTasa,
  Version,
} from "../types";
import { VERSIONES } from "../types";
import { filas, hoja } from "./excel";
import { normalizar, textoCelda } from "./normalizar";

const TIPOS: Tipo[] = [
  "venta_ext", "venta_ic", "costo_ext", "costo_ic", "gasto_op", "depreciacion",
  "gasto_fin", "impuesto", "activos", "pasivos_cte", "capital",
];

type Campo = "concepto" | "tipo" | "contraparte" | "moneda" | "real_2025" | "ppto_2026" | "reforecast_2026";

const SINONIMOS: Record<Campo, string[]> = {
  concepto: ["concepto", "partida", "line item"],
  tipo: ["tipo", "clasificación", "type"],
  contraparte: ["contraparte", "empresa relacionada", "counterparty"],
  moneda: ["moneda", "divisa", "currency"],
  real_2025: ["real 2025", "cierre 2025", "actual 2025"],
  ppto_2026: ["presupuesto original 2026", "presupuesto 2026 v1", "budget 2026"],
  reforecast_2026: ["reforecast 2026", "reforecast 2026 v2"],
};

const IGNORAR = ["variación", "var %", "diferencia", "dif %", "variance"];
const REQUERIDOS: Campo[] = ["concepto", "tipo", "contraparte", "moneda", "real_2025", "ppto_2026", "reforecast_2026"];
const VERSION_CAMPO: Record<Version, Campo> = {
  real_2025: "real_2025",
  ppto_2026: "ppto_2026",
  reforecast_2026: "reforecast_2026",
};

function campoDe(encabezado: string): Campo | "ignorar" | null {
  const n = normalizar(encabezado);
  if (IGNORAR.some((s) => normalizar(s) === n)) return "ignorar";
  for (const campo of Object.keys(SINONIMOS) as Campo[]) {
    if (SINONIMOS[campo].some((s) => normalizar(s) === n)) return campo;
  }
  return null;
}

export function esEncabezadoTipo(celdas: unknown[]): boolean {
  return celdas.some((c) => textoCelda(c) !== "" && campoDe(textoCelda(c)) === "tipo");
}

function esTipo(valor: string): valor is Tipo {
  return (TIPOS as string[]).includes(valor);
}

function mapaNombres(empresas: Record<CodigoEmpresa, Empresa>): Map<string, CodigoEmpresa> {
  return new Map(Object.entries(empresas).map(([codigo, e]) => [normalizar(e.nombre), codigo as CodigoEmpresa]));
}

export function leerPresupuesto(
  libro: XLSX.WorkBook,
  archivo: string,
  empresa: CodigoEmpresa,
  empresas: Record<CodigoEmpresa, Empresa>,
): { registros: RegistroNormalizado[]; avisos: AvisoIngesta[] } {
  const todas = filas(hoja(libro, "Presupuesto"));
  const encabezado = todas.find((f) => esEncabezadoTipo(f.celdas));
  const avisos: AvisoIngesta[] = [];
  if (!encabezado) {
    avisos.push({
      id: `${archivo}:Presupuesto:1`,
      archivo,
      hoja: "Presupuesto",
      fila: 1,
      detalle: "No se encontró la fila de encabezados del presupuesto.",
    });
    return { registros: [], avisos };
  }

  const columnas = {} as Partial<Record<Campo, number>>;
  encabezado.celdas.forEach((celda, i) => {
    const texto = textoCelda(celda);
    if (!texto) return;
    const campo = campoDe(texto);
    if (campo && campo !== "ignorar" && columnas[campo] === undefined) columnas[campo] = i;
  });

  for (const campo of REQUERIDOS) {
    if (columnas[campo] === undefined) {
      avisos.push({
        id: `${archivo}:Presupuesto:${encabezado.fila}:${campo}`,
        archivo,
        hoja: "Presupuesto",
        fila: encabezado.fila,
        detalle: `No se encontró la columna requerida "${campo}".`,
      });
    }
  }
  if (REQUERIDOS.some((campo) => columnas[campo] === undefined)) return { registros: [], avisos };

  const nombres = mapaNombres(empresas);
  const registros: RegistroNormalizado[] = [];
  for (const f of todas) {
    if (f.fila <= encabezado.fila) continue;
    const concepto = textoCelda(f.celdas[columnas.concepto!]);
    if (!concepto) continue;

    const tipoTexto = textoCelda(f.celdas[columnas.tipo!]);
    const moneda = textoCelda(f.celdas[columnas.moneda!]).toUpperCase();
    const nombreContraparte = textoCelda(f.celdas[columnas.contraparte!]);
    if (!esTipo(tipoTexto) || !moneda) {
      avisos.push({
        id: `${archivo}:Presupuesto:${f.fila}`,
        archivo,
        hoja: "Presupuesto",
        fila: f.fila,
        detalle: `Fila de presupuesto incompleta o con tipo no reconocido ("${tipoTexto}").`,
      });
      continue;
    }

    let contraparte: CodigoEmpresa | undefined;
    if (nombreContraparte) {
      contraparte = nombres.get(normalizar(nombreContraparte));
      if (!contraparte) {
        avisos.push({
          id: `${archivo}:Presupuesto:${f.fila}`,
          archivo,
          hoja: "Presupuesto",
          fila: f.fila,
          detalle: `Contraparte desconocida: ${nombreContraparte}`,
        });
      }
    }

    for (const version of VERSIONES) {
      const crudo = f.celdas[columnas[VERSION_CAMPO[version]]!];
      if (crudo === null || crudo === undefined || (typeof crudo === "string" && crudo.trim() === "")) continue;
      const registro: RegistroNormalizado = {
        id: `${archivo}:Presupuesto:${f.fila}:${version}`,
        archivo,
        hoja: "Presupuesto",
        fila: f.fila,
        empresa,
        version,
        concepto,
        tipo: tipoTexto,
        moneda,
        tipoTasa: "promedio" satisfies TipoTasa,
        tasa: null,
        monto: desdeExcel(crudo),
        montoGrupo: null,
      };
      if (contraparte) registro.contraparte = contraparte;
      registros.push(registro);
    }
  }

  return { registros, avisos };
}
