import { Router, type Request, type Response } from "express";
import Decimal, { desdeExcel } from "../decimal";
import { getDataset, setDataset } from "../estado";
import { enviarError, fraccion, monto, noImplementado } from "../http";
import { cargarDataset } from "../ingesta";
import { convertir } from "../monedas";
import { obtenerAlertas } from "../pipeline";
import { VERSIONES, type Alerta, type CodigoEmpresa, type Dataset, type RegistroNormalizado, type Tasas, type TipoTasa, type Version } from "../types";
import multer from "multer";

export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 10 } });
const r = Router();

const CODIGOS: CodigoEmpresa[] = ["TRAC", "AGRO", "FERR", "CONC", "HERR", "LOGI"];
const TIPOS_TASA: TipoTasa[] = ["cierre", "promedio", "presupuesto"];

// TODO(pregunta): docs/backend_idea.md está vacío. La tabla sale de las reglas ya fijadas en el motor.
const SUPUESTOS = [
  { nombre: "Moneda del grupo", detalle: "El consolidado se expresa en la moneda del grupo (GTQ)." },
  { nombre: "Convención de tasas", detalle: "Las tasas están en unidades de moneda local por 1 GTQ. GTQ = monto local / tasa." },
  { nombre: "Tasa de real 2025", detalle: "En real 2025 los resultados usan la tasa promedio y el balance la tasa de cierre." },
  { nombre: "Tasa de 2026", detalle: "Presupuesto y reforecast 2026 usan la tasa de presupuesto para todos los tipos." },
  { nombre: "Gasto financiero", detalle: "El gasto financiero no entra en EBIT, NOPAT, ROIC, ROCE ni EVA." },
  { nombre: "Intercompañía", detalle: "En el grupo se eliminan ventas y costos intercompañía. La tolerancia de conciliación es la de los parámetros." },
  { nombre: "Moneda sin tasa", detalle: "Un registro cuya moneda no tiene tasa no se suma: montoGrupo queda vacío." },
  { nombre: "Signo negativo", detalle: "Un monto negativo se trata como error de captura y se puede corregir con el valor absoluto." },
];

function textoQuery(valor: unknown): string | undefined {
  return typeof valor === "string" ? valor : undefined;
}

function esVersion(valor: string): valor is Version {
  return (VERSIONES as string[]).includes(valor);
}

function esCodigo(valor: string): valor is CodigoEmpresa {
  return (CODIGOS as string[]).includes(valor);
}

function leerTasa(valor: unknown): Decimal | null {
  try {
    const d = typeof valor === "number" ? desdeExcel(valor) : typeof valor === "string" ? new Decimal(valor.trim()) : null;
    if (!d || !d.isFinite() || d.lte(0)) return null;
    return d;
  } catch {
    return null;
  }
}

function serializarRegistro(reg: RegistroNormalizado) {
  return {
    ...reg,
    monto: monto(reg.monto),
    tasa: reg.tasa ? fraccion(reg.tasa) : null,
    montoGrupo: reg.montoGrupo ? monto(reg.montoGrupo) : null,
  };
}

function serializarAlerta(a: Alerta) {
  return {
    id: a.id,
    regla: a.regla,
    severidad: a.severidad,
    empresa: a.empresa,
    versiones: a.versiones,
    referencia: a.referencia,
    filaIds: a.filaIds,
    mensaje: a.mensaje,
    porQueImporta: a.porQueImporta,
    comoSeCorrige: a.comoSeCorrige,
  };
}

function serializarTasas(tasas: Tasas) {
  return Object.fromEntries(Object.entries(tasas).map(([moneda, t]) => [moneda, {
    cierre: fraccion(t.cierre),
    promedio: fraccion(t.promedio),
    presupuesto: fraccion(t.presupuesto),
  }]));
}

function serializarParametros(dataset: Dataset) {
  return {
    monedaGrupo: dataset.parametros.monedaGrupo,
    wacc: fraccion(dataset.parametros.wacc),
    toleranciaIC: monto(dataset.parametros.toleranciaIC),
    periodoCierre: dataset.parametros.periodoCierre,
    anioPresupuesto: dataset.parametros.anioPresupuesto,
  };
}

r.post("/upload", upload.array("archivos"), (req: Request, res: Response) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const archivos = files.map((f) => ({ nombre: f.originalname, buffer: f.buffer }));
  if (!archivos.some((a) => a.nombre.startsWith("00_"))) {
    return enviarError(res, 400, "SIN_PARAMETROS", "Falta el archivo de parámetros del grupo (00_).");
  }
  try {
    const dataset = cargarDataset(archivos);
    setDataset(dataset);
    const alertas = obtenerAlertas(dataset);
    return res.json({
      archivos: archivos.map((a) => a.nombre),
      faltantes: dataset.faltantes,
      totalRegistros: dataset.registros.length,
      alertas: {
        bloqueantes: alertas.filter((a) => a.severidad === "bloqueante").length,
        advertencias: alertas.filter((a) => a.severidad === "advertencia").length,
      },
    });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "No se pudo leer el paquete.";
    return enviarError(res, 400, "INGESTA", mensaje);
  }
});

r.get("/empresas", (_req, res) => {
  const dataset = getDataset();
  res.json(CODIGOS.filter((c) => dataset.empresas[c]).map((codigo) => ({
    codigo,
    nombre: dataset.empresas[codigo].nombre,
    pais: dataset.empresas[codigo].pais,
    moneda: dataset.empresas[codigo].moneda,
  })));
});

r.get("/supuestos", (_req, res) => {
  const dataset = getDataset();
  res.json({ parametros: serializarParametros(dataset), supuestos: SUPUESTOS });
});

r.get("/tasas", (_req, res) => {
  res.json(serializarTasas(getDataset().tasas));
});

r.put("/tasas", (req, res) => {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return enviarError(res, 400, "CUERPO_INVALIDO", "El cuerpo debe ser un objeto de tasas parciales.");
  }
  const dataset = getDataset();
  const tasas: Tasas = Object.fromEntries(Object.entries(dataset.tasas).map(([moneda, t]) => [moneda, { ...t }]));
  for (const [moneda, parcial] of Object.entries(body as Record<string, unknown>)) {
    if (!tasas[moneda]) return enviarError(res, 400, "MONEDA_DESCONOCIDA", `Moneda sin tabla de tasas: ${moneda}.`);
    if (!parcial || typeof parcial !== "object" || Array.isArray(parcial)) {
      return enviarError(res, 400, "CUERPO_INVALIDO", `Las tasas de ${moneda} deben ser un objeto.`);
    }
    for (const [tipo, valor] of Object.entries(parcial)) {
      if (!(TIPOS_TASA as string[]).includes(tipo)) {
        return enviarError(res, 400, "TIPO_TASA_DESCONOCIDO", `Tipo de tasa desconocido: ${tipo}.`);
      }
      const decimal = leerTasa(valor);
      if (!decimal) return enviarError(res, 400, "TASA_INVALIDA", `La tasa ${moneda}.${tipo} debe ser un decimal positivo.`);
      tasas[moneda][tipo as TipoTasa] = decimal;
    }
  }
  const siguiente: Dataset = { ...dataset, tasas, registros: convertir(dataset.registros, tasas) };
  setDataset(siguiente);
  return res.json(serializarTasas(siguiente.tasas));
});

r.get("/validacion", (req, res) => {
  const version = textoQuery(req.query.version);
  if (!version || !esVersion(version)) {
    return enviarError(res, 400, "VERSION_INVALIDA", "version debe ser real_2025, ppto_2026 o reforecast_2026.");
  }
  const alertas = obtenerAlertas(getDataset()).filter((a) => a.versiones.includes(version));
  const bloqueantes = alertas.filter((a) => a.severidad === "bloqueante").length;
  const advertencias = alertas.filter((a) => a.severidad === "advertencia").length;
  return res.json({
    version,
    publicable: bloqueantes === 0,
    resumen: { bloqueantes, advertencias },
    alertas: alertas.map(serializarAlerta),
  });
});

r.get("/registros", (req, res) => {
  const empresa = textoQuery(req.query.empresa);
  const version = textoQuery(req.query.version);
  const ids = textoQuery(req.query.ids);
  if (empresa && !esCodigo(empresa)) return enviarError(res, 400, "EMPRESA_INVALIDA", `Empresa no reconocida: ${empresa}.`);
  if (version && !esVersion(version)) {
    return enviarError(res, 400, "VERSION_INVALIDA", "version debe ser real_2025, ppto_2026 o reforecast_2026.");
  }
  const filtroIds = ids ? new Set(ids.split(",").map((id) => id.trim()).filter(Boolean)) : null;
  const registros = getDataset().registros.filter((reg) => {
    if (empresa && reg.empresa !== empresa) return false;
    if (version && reg.version !== version) return false;
    if (filtroIds && !filtroIds.has(reg.id)) return false;
    return true;
  });
  return res.json({ registros: registros.map(serializarRegistro) });
});

r.get("/sensibilidad", noImplementado);
r.post("/explicar", noImplementado);

export default r;
