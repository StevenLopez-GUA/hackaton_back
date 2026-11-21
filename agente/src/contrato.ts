// Tipos copiados de backend_idea (v3).md — contrato compartido con el backend.
export type CodigoEmpresa = "TRAC" | "AGRO" | "FERR" | "CONC" | "HERR" | "LOGI";
export type Version = "real_2025" | "ppto_2026" | "reforecast_2026";
export type Monto = string; // decimal serializado; porcentajes como fracción

export const EMPRESAS: CodigoEmpresa[] = ["TRAC", "AGRO", "FERR", "CONC", "HERR", "LOGI"];
export const VERSIONES: Version[] = ["real_2025", "ppto_2026", "reforecast_2026"];

export type Resultado = { valor: Monto; origen: string[] };

export type Indicadores = {
  ventas?: Resultado;
  ebit: Resultado;
  nopat?: Resultado;
  roic: Monto;
  roce: Monto;
  eva: Resultado;
};

export type Consolidado = {
  version: Version;
  publicable: boolean;
  grupo: Indicadores | null;
  grupoCorregido?: Indicadores; // extra del mock: valores tras aplicar correcciones
  empresas: Partial<Record<CodigoEmpresa, { conAlertas: boolean; indicadores: Indicadores }>>;
};

export type Alerta = {
  id: string;
  regla: "archivo_faltante" | "duplicado" | "signo" | "moneda" | "intercompania" | "total" | "encabezado";
  severidad: "bloqueante" | "advertencia";
  empresa: CodigoEmpresa | CodigoEmpresa[];
  versiones: Version[];
  ubicacion: string;
  mensaje: string;
  porQueImporta?: string;
  comoSeCorrige?: string;
};

export type Validacion = { alertas: Alerta[] };

export type ImpactoVersion = {
  version: Version;
  ebitConErrores: Monto;
  ebitCorregido: Monto;
  roicCon: Monto;
  roicSin: Monto;
  evaConErrores: Monto;
  evaCorregido: Monto;
  nota?: string;
};

export type Puente = {
  empresa: CodigoEmpresa;
  metrica: "ebit";
  moneda: string;
  desde: { version: Version; local: Monto; tasa: Monto };
  hasta: { version: Version; local: Monto; tasa: Monto };
  base: Monto;
  operativo: Monto;
  cambiario: Monto;
  nuevo: Monto;
};

export type Supuestos = { monedaGrupo: string; wacc: Monto; toleranciaIC: Monto };
