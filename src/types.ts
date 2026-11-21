// Contrato compartido del backend. Solo se cambia con acuerdo de ambos.
// Montos en memoria: Decimal (decimal.js). En JSON/fixtures: string.
import type Decimal from "decimal.js";

export type CodigoEmpresa = "TRAC" | "AGRO" | "FERR" | "CONC" | "HERR" | "LOGI";
export type Version = "real_2025" | "ppto_2026" | "reforecast_2026";
export type TipoTasa = "cierre" | "promedio" | "presupuesto";
export type Tipo =
  | "venta_ext" | "venta_ic" | "costo_ext" | "costo_ic"
  | "gasto_op" | "depreciacion" | "gasto_fin" | "impuesto"
  | "activos" | "pasivos_cte" | "capital";

export const VERSIONES: Version[] = ["real_2025", "ppto_2026", "reforecast_2026"];
export const TIPOS_BALANCE: Tipo[] = ["activos", "pasivos_cte", "capital"];

export type Empresa = { nombre: string; pais: string; moneda: string; archivo: string };
export type Tasas = Record<string, Record<TipoTasa, Decimal>>;
export type Parametros = {
  monedaGrupo: string;
  wacc: Decimal;
  toleranciaIC: Decimal;
  periodoCierre: string;
  anioPresupuesto: number;
};

export type RegistroNormalizado = {
  id: string;              // "<archivo>:Presupuesto:<fila>:<version>"
  archivo: string;
  hoja: "Presupuesto";
  fila: number;
  empresa: CodigoEmpresa;
  version: Version;
  concepto: string;
  tipo: Tipo;
  contraparte?: CodigoEmpresa;
  moneda: string;
  tipoTasa: TipoTasa;
  tasa: Decimal | null;     // null si la moneda no tiene tasa
  monto: Decimal;           // moneda original
  montoGrupo: Decimal | null; // GTQ; null si no se pudo convertir
};

// Filas de la hoja Intercompania (solo Real 2025)
export type FilaIC = {
  id: string;               // "<archivo>:Intercompania:<fila>"
  referencia: string;       // "IC-2025-05"
  empresa: CodigoEmpresa;
  tipo: "venta_ic" | "costo_ic";
  contraparte: CodigoEmpresa;
  concepto: string;
  moneda: string;
  monto2025: Decimal;       // flujo del año -> tasa promedio
  saldoCierre: Decimal;     // saldo al 31-dic -> tasa cierre
};

// Subtotales leídos de Balance_General / Estado_Resultados para la regla "total"
export type TotalDeclarado = {
  id: string;               // "<archivo>:Balance_General:13"
  empresa: CodigoEmpresa;
  etiqueta: string;         // "Total activo corriente"
  declarado: Decimal;
  sumaLineas: Decimal;
  lineaIds: string[];
};

export type Dataset = {
  empresas: Record<CodigoEmpresa, Empresa>;
  tasas: Tasas;
  parametros: Parametros;
  registros: RegistroNormalizado[];
  intercompania: FilaIC[];
  totales: TotalDeclarado[];
  faltantes: CodigoEmpresa[];
  avisosIngesta: AvisoIngesta[];
};

// Problemas detectados al leer los Excel (A los convierte en alertas "encabezado").
export type AvisoIngesta = {
  id: string;               // "<archivo>:<hoja>:<fila>"
  archivo: string;
  hoja: string;
  fila: number;
  detalle: string;          // "Columna 'Divisa' no reconocida", "Contraparte desconocida: ..."
};

export type Severidad = "bloqueante" | "advertencia";
export type Regla =
  | "archivo_faltante" | "encabezado" | "duplicado" | "signo"
  | "moneda" | "intercompania" | "total";

export type ImpactoError = {
  supuestoCorreccion: string;
  metrica: "ebit_grupo";
  valorConError: Decimal;
  valorSinError: Decimal;
  diferencia: Decimal;
  indicadoresAfectados: { nombre: string; nivel: "grupo" | CodigoEmpresa; con: Decimal; sin: Decimal }[];
};

export type Alerta = {
  id: string;               // "A-01"
  regla: Regla;
  severidad: Severidad;
  empresa: CodigoEmpresa | CodigoEmpresa[];
  versiones: Version[];
  referencia?: string;      // solo intercompania
  filaIds: string[];
  mensaje: string;
  porQueImporta: string;
  comoSeCorrige: string;
  impacto?: ImpactoError;
};

export type Resultado = { valor: Decimal; origen: string[] };

export type Indicadores = {
  ventas: Resultado; ebit: Resultado; nopat: Resultado;
  capital: Resultado; capitalEmpleado: Resultado;
  roic: Decimal; roce: Decimal; eva: Resultado;
};

export type EliminacionIC = {
  ventasEliminadas: Decimal;
  costosEliminados: Decimal;
  diferenciaNoConciliada: Decimal;
};

export type Consolidado = {
  version: Version;
  publicable: boolean;
  grupo: Indicadores | null;
  empresas: Record<CodigoEmpresa, { conAlertas: boolean; indicadores: Indicadores }>;
  eliminacionesIC: EliminacionIC;
};

// ---------- Firmas: quién implementa qué ----------

// Compartido (setup juntos): src/monedas.ts
export type ElegirTipoTasa = (version: Version, tipo: Tipo) => TipoTasa;
export type Convertir = (registros: RegistroNormalizado[], tasas: Tasas) => RegistroNormalizado[];

// Persona A: src/ingesta, src/validador
export type CargarDataset = (archivos: { nombre: string; buffer: Buffer }[]) => Dataset;
export type Validar = (dataset: Dataset) => Alerta[];            // todas las reglas MENOS intercompania
export type Corregir = (dataset: Dataset, alerta: Alerta) =>
  { dataset: Dataset; supuesto: string } | null; // null = sin corrección automática (intercompania, total, encabezado, archivo_faltante)
// corregir() devuelve un dataset NUEVO (no muta) y ya reconvertido con convertir() si cambió alguna moneda.

// Persona B: src/calculo
export type ConciliarIC = (dataset: Dataset, version: Version, excluirIds: string[]) =>
  { eliminacion: EliminacionIC; alertas: Alerta[] };              // excluirIds = filas marcadas como duplicado
export type Calcular = (dataset: Dataset, version: Version, alertas: Alerta[]) => Consolidado; // aplica la compuerta
export type CalcularGrupo = (dataset: Dataset, version: Version) => Indicadores;                // sin compuerta (impacto, sensibilidad)
