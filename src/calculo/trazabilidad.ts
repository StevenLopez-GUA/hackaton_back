// PERSONA B. Árbol de una métrica hasta sus filas de origen.
// Componentes por tipo; hijos por empresa (nivel grupo) o por registro (nivel empresa).
// Invariante: Σ (signo × componente.valor) = valor, y Σ hijos.valor = componente.valor.
import Decimal from "../decimal";
import type { CodigoEmpresa, Dataset, Version } from "../types";
import { sumar, terminos, type Metrica } from "./indicadores";

export type HijoTraza = { nombre: string; valor: Decimal; origen: string[] };
export type ComponenteTraza = { nombre: string; signo: "+" | "-"; valor: Decimal; hijos: HijoTraza[] };
export type Traza = {
  metrica: Metrica;
  nivel: "grupo" | CodigoEmpresa;
  version: Version;
  valor: Decimal;
  componentes: ComponenteTraza[];
};

export function trazar(dataset: Dataset, version: Version, metrica: Metrica, nivel: "grupo" | CodigoEmpresa): Traza {
  const esGrupo = nivel === "grupo";
  const ts = terminos(metrica, esGrupo ? "grupo" : "empresa", dataset.parametros.wacc);
  const registros = dataset.registros.filter(
    (r) => r.version === version && r.montoGrupo !== null && (esGrupo || r.empresa === nivel),
  );

  const componentes = ts.map(({ tipo, factor }): ComponenteTraza => {
    const escala = factor.abs();
    const deTipo = registros.filter((r) => r.tipo === tipo);
    const hijos: HijoTraza[] = esGrupo
      ? (Object.keys(dataset.empresas) as CodigoEmpresa[])
          .map((e) => {
            const propios = deTipo.filter((r) => r.empresa === e);
            const valor = propios.reduce((s, r) => s.plus(r.montoGrupo!.times(escala)), new Decimal(0));
            return { nombre: e, valor, origen: propios.map((r) => r.id) };
          })
          .filter((h) => h.origen.length > 0)
      : deTipo.map((r) => ({ nombre: r.concepto, valor: r.montoGrupo!.times(escala), origen: [r.id] }));
    return {
      // En EVA el capital entra como cargo: WACC × capital.
      nombre: metrica === "eva" && tipo === "capital" ? "cargo_capital" : tipo,
      signo: factor.isNeg() ? "-" : "+",
      valor: hijos.reduce((s, h) => s.plus(h.valor), new Decimal(0)),
      hijos,
    };
  });

  return { metrica, nivel, version, valor: sumar(registros, ts).valor, componentes };
}
