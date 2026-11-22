import { convertir } from "../monedas";
import { idsDuplicados } from "../pipeline";
import type { Corregir, Dataset, RegistroNormalizado } from "../types";

function conRegistros(dataset: Dataset, registros: RegistroNormalizado[]): Dataset {
  return { ...dataset, registros };
}

export const corregir: Corregir = (dataset, alerta) => {
  if (alerta.regla === "signo") {
    const ids = new Set(alerta.filaIds);
    const registros = dataset.registros.map((r) => (ids.has(r.id) ? { ...r, monto: r.monto.abs() } : r));
    return {
      dataset: conRegistros(dataset, convertir(registros, dataset.tasas)),
      supuesto: "Se asume que el signo negativo es un error de captura.",
    };
  }

  if (alerta.regla === "moneda") {
    const empresa = Array.isArray(alerta.empresa) ? null : alerta.empresa;
    if (!empresa) return null;
    const funcional = dataset.empresas[empresa].moneda;
    const ids = new Set(alerta.filaIds);
    const registros = dataset.registros.map((r) => (ids.has(r.id) ? { ...r, moneda: funcional } : r));
    return {
      dataset: conRegistros(dataset, convertir(registros, dataset.tasas)),
      supuesto: `Se asume que la moneda correcta es ${funcional} (moneda funcional de ${empresa}).`,
    };
  }

  if (alerta.regla === "duplicado") {
    const quitar = new Set(idsDuplicados([alerta]));
    const registros = dataset.registros.filter((r) => !quitar.has(r.id));
    return {
      dataset: conRegistros(dataset, registros),
      supuesto: "Se elimina la fila repetida.",
    };
  }

  return null;
};
