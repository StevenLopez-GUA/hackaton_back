import * as A from "./analisis.js";

const version = { type: "string", enum: ["real_2025", "ppto_2026", "reforecast_2026"], description: "Versión del presupuesto" };
const empresa = { type: "string", enum: ["TRAC", "AGRO", "FERR", "CONC", "HERR", "LOGI"], description: "Código de empresa" };
const sujeto = { type: "string", enum: ["GRUPO", "TRAC", "AGRO", "FERR", "CONC", "HERR", "LOGI"], description: "GRUPO o código de empresa" };
const metrica = { type: "string", enum: ["ventas", "ebit", "nopat", "eva", "roic", "roce"] };

const fn = (name: string, description: string, properties: object = {}, required: string[] = []) => ({
  type: "function" as const,
  function: { name, description, parameters: { type: "object", properties, required } },
});

export const TOOLS = [
  fn("resumenGrupo", "Indicadores del grupo consolidado (corregidos), si es publicable, número de alertas y cuánto distorsionan los errores el EBIT.", { version }),
  fn("calcular", "Calculadora exacta. Úsala para TODA suma, resta, variación % o participación % que no venga ya en los datos. Envía números sin formato.", {
    operacion: { type: "string", enum: ["sumar", "restar", "variacion_pct", "participacion_pct"],
      description: "variacion_pct: [desde, hasta]; participacion_pct: [parte, total]" },
    valores: { type: "array", items: { type: "number" } },
  }, ["operacion", "valores"]),
  fn("compararEmpresas", "Ranking de las 6 empresas por una métrica (mejor/peor ROIC, mayores ventas, etc.). Úsala en vez de consultar empresa por empresa.", { metrica, version }, ["metrica"]),
  fn("indicadoresEmpresa","Ventas, EBIT, NOPAT, ROIC, ROCE y EVA de una empresa.", { empresa, version }, ["empresa"]),
  fn("listarAlertas", "Errores detectados por el validador (qué, dónde, severidad).", { version }),
  fn("impactoPorAlerta", "Cuánto cambia el EBIT y los indicadores del grupo al corregir UNA alerta específica (o todas, por separado).", { version, alertaId: { type: "string", description: "ID como A-05; omitir para todas" } }),
  fn("puente", "Descompone el cambio de EBIT Real 2025 → Presupuesto 2026 en efecto operativo y efecto cambiario.", { empresa }, ["empresa"]),
  fn("tendencia", "Valores de una métrica en Real 2025, Presupuesto 2026 y Reforecast 2026, con crecimiento y desvío del reforecast vs presupuesto.", { sujeto, metrica }, ["sujeto", "metrica"]),
  fn("proyectar2027", "Proyección 2027 por tendencia de una métrica, con supuesto y limitaciones.", { sujeto, metrica }, ["sujeto", "metrica"]),
  fn("riesgos", "Empresas que destruyen valor (ROIC < WACC o EVA negativo) y las que crean valor.", { version }),
];

export async function ejecutar(nombre: string, args: any): Promise<unknown> {
  switch (nombre) {
    case "resumenGrupo": return A.resumenGrupo(args.version);
    case "calcular": return A.calcular(args.operacion, args.valores);
    case "compararEmpresas": return A.compararEmpresas(args.metrica, args.version);
    case "indicadoresEmpresa": return A.indicadoresEmpresa(args.empresa, args.version);
    case "listarAlertas": return A.listarAlertas(args.version);
    case "impactoPorAlerta": return A.impactoPorAlerta(args.version, args.alertaId);
    case "puente": return A.puente(args.empresa);
    case "tendencia": return A.tendencia(args.sujeto, args.metrica);
    case "proyectar2027": return A.proyectar2027(args.sujeto, args.metrica);
    case "riesgos": return A.riesgos(args.version);
    default: return { error: `Herramienta desconocida: ${nombre}` };
  }
}
