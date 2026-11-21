// PERSONA B. Consolidador.
// calcularGrupo: indicadores del grupo SIN compuerta (lo usan impacto y sensibilidad).
// calcular: empresas + grupo con compuerta + eliminacionesIC.
// No excluye duplicados ni corrige: los valores "con errores" incluyen los errores a propósito.
import { idsDuplicados } from "../pipeline";
import type { Calcular, CalcularGrupo, CodigoEmpresa, Consolidado } from "../types";
import { calcularIndicadores } from "./indicadores";
import { conciliarIC } from "./intercompania";

export const calcularGrupo: CalcularGrupo = (dataset, version) =>
  calcularIndicadores(
    dataset.registros.filter((r) => r.version === version),
    dataset.parametros.wacc,
    "grupo",
  );

export const calcular: Calcular = (dataset, version, alertas) => {
  const deVersion = alertas.filter((a) => a.versiones.includes(version));
  const publicable = !deVersion.some((a) => a.severidad === "bloqueante");
  const empresas = {} as Consolidado["empresas"];
  for (const codigo of Object.keys(dataset.empresas) as CodigoEmpresa[]) {
    const registros = dataset.registros.filter((r) => r.version === version && r.empresa === codigo);
    empresas[codigo] = {
      conAlertas: deVersion.some((a) => [a.empresa].flat().includes(codigo)),
      indicadores: calcularIndicadores(registros, dataset.parametros.wacc, "empresa"),
    };
  }
  return {
    version,
    publicable,
    grupo: publicable ? calcularGrupo(dataset, version) : null,
    empresas,
    eliminacionesIC: conciliarIC(dataset, version, idsDuplicados(alertas)).eliminacion,
  };
};
