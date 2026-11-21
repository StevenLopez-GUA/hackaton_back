// COMPARTIDO. Une las alertas de A (validar) y de B (conciliarIC) y les asigna IDs estables.
import { conciliarIC } from "./calculo/intercompania";
import { validar } from "./validador";
import { VERSIONES, type Alerta, type Dataset } from "./types";

const natural = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });

// Filas que son copia de otra (todas menos la primera aparición por versión). Se excluyen de la conciliación IC.
export function idsDuplicados(alertas: Alerta[]): string[] {
  const excluir: string[] = [];
  for (const a of alertas.filter((x) => x.regla === "duplicado")) {
    const porVersion = new Map<string, string[]>();
    for (const id of a.filaIds) {
      const version = id.split(":").at(-1)!;
      porVersion.set(version, [...(porVersion.get(version) ?? []), id]);
    }
    for (const ids of porVersion.values()) excluir.push(...ids.sort(natural).slice(1));
  }
  return excluir;
}

// Regla de IDs: filaIds en orden natural; alertas ordenadas por su primer filaId; numeradas A-01, A-02, ...
export function numerar(alertas: Alerta[]): Alerta[] {
  return alertas
    .map((a) => ({ ...a, filaIds: [...a.filaIds].sort(natural) }))
    .sort((a, b) => natural(a.filaIds[0], b.filaIds[0]))
    .map((a, i) => ({ ...a, id: `A-${String(i + 1).padStart(2, "0")}` }));
}

export function obtenerAlertas(dataset: Dataset): Alerta[] {
  const propias = validar(dataset);
  const excluir = idsDuplicados(propias);
  const ic = new Map<string, Alerta>();
  for (const v of VERSIONES) {
    for (const a of conciliarIC(dataset, v, excluir).alertas) {
      const clave = [...a.filaIds].sort(natural).join("|");
      const previa = ic.get(clave);
      ic.set(clave, previa ? { ...previa, versiones: [...new Set([...previa.versiones, ...a.versiones])] } : a);
    }
  }
  return numerar([...propias, ...ic.values()]);
}
