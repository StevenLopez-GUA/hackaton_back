import "dotenv/config";
import Groq from "groq-sdk";
import { TOOLS, ejecutar } from "./herramientas.js";
import { SISTEMA, PROMPT_ALERTA, PROMPT_PUENTE, PROMPT_INFORME } from "./prompts.js";
import { plantillaAlerta, plantillaGenerica, plantillaPuente } from "./plantillas.js";
import { fuente } from "./fuente.js";
import type { CodigoEmpresa } from "./contrato.js";
import { formatearPuente } from "./analisis.js";
import * as A from "./analisis.js";
import { q } from "./formato.js";
import { graficaPara, type Grafica } from "./graficas.js";

const MODELO = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";
const MAX_VUELTAS = 8;
let _groq: Groq | null = null;
const cliente = () => (_groq ??= new Groq({ apiKey: process.env.GROQ_API_KEY, timeout: 30_000, maxRetries: 0 }));
const RESPALDO = process.env.GROQ_MODEL_RESPALDO ?? "openai/gpt-oss-20b";
let modeloActivo = MODELO;
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Llama a Groq manejando los límites de la capa gratuita:
 * - límite por minuto (429 TPM): espera lo que pide Groq (máx. 30 s) y reintenta, hasta 2 veces.
 * - límite por día (429 TPD): cambia de inmediato al modelo de respaldo, que tiene cuota propia.
 */
async function completar(params: any) {
  for (let intento = 0; ; intento++) {
    try {
      return await cliente().chat.completions.create({ ...params, model: modeloActivo });
    } catch (e: any) {
      if (e?.status !== 429) throw e;
      const msg = e?.message ?? "";
      if (/per day/i.test(msg)) {
        if (modeloActivo === RESPALDO) throw e;
        modeloActivo = RESPALDO;
        continue;
      }
      const seg = Number(/try again in ([d.]+)s/i.exec(msg)?.[1] ?? 5);
      if (intento >= 2 || seg > 30) throw e;
      await esperar(seg * 1000 + 300);
    }
  }
}
const groq = () => ({ chat: { completions: { create: completar } } });

/** Normaliza el texto del modelo al formato del producto: "9.63 %" → "9.63%", guiones raros → "-". */
const GUIONES = new RegExp("[" + String.fromCharCode(0x2010) + "-" + String.fromCharCode(0x2015, 0x2212) + "]", "g");
const ESPACIOS_RAROS = new RegExp("[" + String.fromCharCode(0x00a0, 0x202f) + "]", "g");
export const limpiar = (t: string) =>
  t.replace(GUIONES, "-").replace(ESPACIOS_RAROS, " ").replace(/([0-9]) +%/g, "$1%");

export type Respuesta = {
  texto: string;
  fuente: "ia" | "plantilla";
  modelo?: string;
  herramientasUsadas: { nombre: string; args: unknown }[];
  ms: number;
  error?: string;
  /** Gráfica armada por código a partir de las herramientas usadas (ver src/graficas.ts). */
  grafica?: Grafica;
};

/** Agente con herramientas: el modelo decide qué consultar, el código calcula, el modelo redacta. */
export async function preguntar(pregunta: string, extraSistema = ""): Promise<Respuesta> {
  const t0 = Date.now();
  const usadas: Respuesta["herramientasUsadas"] = [];
  const mensajes: any[] = [
    { role: "system", content: SISTEMA + extraSistema },
    { role: "user", content: pregunta },
  ];
  const resultados: unknown[] = [];
  try {
    let fallosTool = 0, vacioReintentado = false;
    for (let i = 0; i < MAX_VUELTAS; i++) {
      let r;
      try {
        r = await groq().chat.completions.create({
          // En la última vuelta se obliga a responder con lo que ya tiene.
          model: MODELO, messages: mensajes, tools: TOOLS as any, temperature: 0,
          tool_choice: i === MAX_VUELTAS - 1 ? "none" : "auto",
        });
      } catch (e: any) {
        // gpt-oss a veces genera mal el nombre de una herramienta (tool_use_failed): reintentar la vuelta.
        if (e?.error?.error?.code === "tool_use_failed" && fallosTool++ < 2) { i--; continue; }
        throw e;
      }
      const msg = r.choices[0].message;
      mensajes.push(msg);
      if (!msg.tool_calls?.length) {
        // A veces el modelo responde vacío (sobre todo al negarse). Se le pide una vez más que conteste con texto.
        if (!msg.content?.trim() && !vacioReintentado) {
          vacioReintentado = true;
          mensajes.push({ role: "user", content: "Responde ahora en texto, siguiendo tus reglas, con los datos que ya tienes." });
          continue;
        }
        if (!msg.content?.trim()) throw new Error("El modelo respondió vacío.");
        return { texto: limpiar(msg.content ?? ""), fuente: "ia", modelo: modeloActivo, herramientasUsadas: usadas, ms: Date.now() - t0,
          grafica: await graficaPara(usadas) };
      }
      for (const tc of msg.tool_calls) {
        const args = JSON.parse(tc.function.arguments || "{}");
        usadas.push({ nombre: tc.function.name, args });
        const resultado = await ejecutar(tc.function.name, args).catch((e) => ({ error: String(e) }));
        resultados.push(resultado);
        mensajes.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(resultado) });
      }
    }
    throw new Error("El agente superó el máximo de vueltas sin responder.");
  } catch (e: any) {
    // Respaldo: devolvemos los datos verificados que alcanzamos a consultar.
    const datos = resultados.length ? resultados : await ejecutar("resumenGrupo", { version: "real_2025" });
    return { texto: plantillaGenerica(datos), fuente: "plantilla", herramientasUsadas: usadas, ms: Date.now() - t0, error: e?.message ?? String(e),
      grafica: await graficaPara(usadas) };
  }
}

async function redactar(prompt: string, respaldo: string): Promise<Respuesta> {
  const t0 = Date.now();
  try {
    const r = await groq().chat.completions.create({
      model: MODELO, temperature: 0,
      messages: [{ role: "system", content: SISTEMA }, { role: "user", content: prompt }],
    });
    return { texto: limpiar(r.choices[0].message.content ?? respaldo), fuente: "ia", modelo: modeloActivo, herramientasUsadas: [], ms: Date.now() - t0 };
  } catch (e: any) {
    return { texto: respaldo, fuente: "plantilla", herramientasUsadas: [], ms: Date.now() - t0, error: e?.message ?? String(e) };
  }
}

/** Compatible con POST /api/explicar del backend v3: { tipo: "alerta", id } | { tipo: "puente", empresa }. */
export async function explicar(p: { tipo: "alerta"; id: string } | { tipo: "puente"; empresa: CodigoEmpresa }): Promise<Respuesta> {
  if (p.tipo === "alerta") {
    const a = (await fuente.alertas()).find((x) => x.id === p.id);
    if (!a) return { texto: `No existe la alerta ${p.id}.`, fuente: "plantilla", herramientasUsadas: [], ms: 0 };
    const imp = await fuente.impacto(a.versiones[0]);
    const contextoGrupo = imp && {
      advertencia: "Estas cifras son del GRUPO completo con TODOS los errores juntos, no solo de esta alerta ni de esta empresa.",
      version: imp.version,
      ebitGrupoConTodosLosErrores: q(Number(imp.ebitConErrores)),
      ebitGrupoCorregido: q(Number(imp.ebitCorregido)),
      nota: imp.nota,
    };
    const r = await redactar(PROMPT_ALERTA(a, contextoGrupo), plantillaAlerta(a));
    return { ...r, grafica: await graficaPara([{ nombre: "impactoPorAlerta", args: { version: a.versiones[0], alertaId: a.id } }]) };
  }
  const pu = await fuente.puente(p.empresa);
  if (!pu) return { texto: `No hay puente calculado para ${p.empresa}.`, fuente: "plantilla", herramientasUsadas: [], ms: 0 };
  const r = await redactar(PROMPT_PUENTE(formatearPuente(pu)), plantillaPuente(pu));
  return { ...r, grafica: await graficaPara([{ nombre: "puente", args: { empresa: p.empresa } }]) };
}

/** Informe ejecutivo completo (usa el agente con herramientas). */
export async function informe(): Promise<Respuesta> {
  // El código junta los datos (sin vueltas de herramientas): una sola llamada al modelo, rápida y dentro del límite de tokens.
  const datos = {
    estadoDatos_real2025: await A.resumenGrupo("real_2025"),
    alertas: (await A.listarAlertas()).map((a) => `${a.id} ${a.regla} (${a.severidad}) ${[a.empresa].flat().join("/")}: ${a.mensaje}`),
    impacto_ppto2026: (await A.resumenGrupo("ppto_2026")).impactoDeTodosLosErroresJuntos,
    riesgos_real2025: await A.riesgos("real_2025"),
    tendenciaEbitGrupo: await A.tendencia("GRUPO", "ebit"),
    proyeccionEbit2027: await A.proyectar2027("GRUPO", "ebit"),
  };
  const { contexto, ...proy } = datos.proyeccionEbit2027 as any;
  const r = await redactar(`${PROMPT_INFORME}\nDatos verificados: ${JSON.stringify({ ...datos, proyeccionEbit2027: proy })}`,
    plantillaGenerica(datos));
  return { ...r, herramientasUsadas: Object.keys(datos).map((nombre) => ({ nombre, args: {} })),
    grafica: await graficaPara([{ nombre: "proyectar2027", args: { sujeto: "GRUPO", metrica: "ebit" } }]) };
}
