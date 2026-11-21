// Corrección de TEST (no es el corregir() de Persona A): reproduce el "corregido" de valores_esperados.json.
// Quita la copia duplicada (HERR fila 17), gasto_op en valor absoluto, moneda funcional y reconversión.
import Decimal from "../../src/decimal";
import { cargarAlertasFixture } from "../../src/fixtures";
import { convertir } from "../../src/monedas";
import { idsDuplicados } from "../../src/pipeline";
import type { Dataset } from "../../src/types";

export function corregirTodo(dataset: Dataset): Dataset {
  const fuera = new Set(idsDuplicados(cargarAlertasFixture()));
  const registros = dataset.registros
    .filter((r) => !fuera.has(r.id))
    .map((r) => ({
      ...r,
      monto: r.tipo === "gasto_op" ? r.monto.abs() : r.monto,
      moneda: dataset.empresas[r.empresa].moneda,
    }));
  return { ...dataset, registros: convertir(registros, dataset.tasas) };
}

export function cerca(real: Decimal, esperado: string, tolerancia: string): boolean {
  return real.minus(esperado).abs().lte(tolerancia);
}
