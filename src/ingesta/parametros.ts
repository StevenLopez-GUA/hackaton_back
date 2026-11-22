import type * as XLSX from "xlsx";
import { desdeExcel } from "../decimal";
import type { CodigoEmpresa, Empresa, Parametros, Tasas } from "../types";
import { filas, hoja } from "./excel";
import { filaVacia, normalizar, textoCelda } from "./normalizar";

const CODIGOS: CodigoEmpresa[] = ["TRAC", "AGRO", "FERR", "CONC", "HERR", "LOGI"];
const MESES: Record<string, string> = {
  ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06",
  jul: "07", ago: "08", sep: "09", oct: "10", nov: "11", dic: "12",
};

function esCodigo(valor: string): valor is CodigoEmpresa {
  return (CODIGOS as string[]).includes(valor);
}

function aIso(valor: unknown): string {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    const mes = String(valor.getUTCMonth() + 1).padStart(2, "0");
    const dia = String(valor.getUTCDate()).padStart(2, "0");
    return `${valor.getUTCFullYear()}-${mes}-${dia}`;
  }
  const texto = textoCelda(valor);
  const partes = texto.toLowerCase().match(/^(\d{1,2})-([a-z]+)-(\d{4})$/);
  if (partes) {
    const mes = MESES[normalizar(partes[2]).slice(0, 3)];
    if (!mes) throw new Error(`Mes no reconocido en la fecha "${texto}".`);
    return `${partes[3]}-${mes}-${partes[1].padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
  throw new Error(`Fecha no reconocida: "${texto}".`);
}

function buscarEncabezado(libro: XLSX.WorkBook, nombreHoja: string, primerValor: string) {
  const todas = filas(hoja(libro, nombreHoja));
  const inicio = todas.findIndex((f) => normalizar(textoCelda(f.celdas[0])) === normalizar(primerValor));
  if (inicio < 0) throw new Error(`No se encontró la fila "${primerValor}" en ${nombreHoja}.`);
  const datos: { fila: number; celdas: unknown[] }[] = [];
  for (const f of todas.slice(inicio + 1)) {
    if (filaVacia(f.celdas)) break;
    datos.push(f);
  }
  return datos;
}

export function leerParametros(libro: XLSX.WorkBook): { empresas: Record<CodigoEmpresa, Empresa>; tasas: Tasas; parametros: Parametros } {
  const empresas = {} as Record<CodigoEmpresa, Empresa>;
  for (const f of buscarEncabezado(libro, "Empresas", "Código")) {
    const codigo = textoCelda(f.celdas[0]);
    if (!esCodigo(codigo)) throw new Error(`Código de empresa no reconocido: "${codigo}".`);
    empresas[codigo] = {
      nombre: textoCelda(f.celdas[1]),
      pais: textoCelda(f.celdas[2]),
      moneda: textoCelda(f.celdas[3]).toUpperCase(),
      archivo: textoCelda(f.celdas[5]),
    };
  }

  const tasas: Tasas = {};
  for (const f of buscarEncabezado(libro, "Tasas", "Moneda")) {
    const moneda = textoCelda(f.celdas[0]).toUpperCase();
    if (!moneda) continue;
    tasas[moneda] = {
      cierre: desdeExcel(f.celdas[2]),
      promedio: desdeExcel(f.celdas[3]),
      presupuesto: desdeExcel(f.celdas[4]),
    };
  }

  const etiquetas = filas(hoja(libro, "Parametros"));
  const porClave = (clave: string) => {
    const fila = etiquetas.find((f) => normalizar(textoCelda(f.celdas[0])).includes(normalizar(clave)));
    if (!fila) throw new Error(`No se encontró el parámetro "${clave}".`);
    return fila.celdas[1];
  };

  const parametros: Parametros = {
    monedaGrupo: textoCelda(porClave("Moneda del grupo")).toUpperCase(),
    wacc: desdeExcel(porClave("WACC")),
    toleranciaIC: desdeExcel(porClave("Tolerancia")),
    periodoCierre: aIso(porClave("Período de cierre")),
    anioPresupuesto: desdeExcel(porClave("Año presupuestario")).toNumber(),
  };

  return { empresas, tasas, parametros };
}
