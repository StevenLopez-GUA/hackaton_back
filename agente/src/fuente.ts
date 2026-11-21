import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { VERSIONES, type Alerta, type CodigoEmpresa, type Consolidado, type ImpactoVersion, type Puente, type Supuestos, type Version } from "./contrato.js";

/** Todo lo que el agente sabe de los datos pasa por aquí. Al integrar, solo cambia la implementación. */
export interface FuenteDatos {
  consolidado(version: Version): Promise<Consolidado>;
  alertas(): Promise<Alerta[]>;
  impacto(version: Version): Promise<ImpactoVersion | undefined>;
  puente(empresa: CodigoEmpresa): Promise<Puente | undefined>;
  supuestos(): Promise<Supuestos>;
  /** Costo de cada alerta por separado (vacío si la fuente no lo tiene). */
  impactoPorAlerta(version: Version): Promise<unknown[]>;
}

const FIX = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const leer = (f: string) => JSON.parse(readFileSync(join(FIX, f), "utf8"));

export class FuenteMock implements FuenteDatos {
  private c = leer("consolidado.json");
  private v = leer("validacion.json");
  private i: ImpactoVersion[] = leer("impacto.json");
  private p: Puente[] = leer("puentes.json");
  async consolidado(version: Version) { return this.c[version] as Consolidado; }
  async alertas() { return this.v.alertas as Alerta[]; }
  async impacto(version: Version) { return this.i.find((x) => x.version === version); }
  async puente(empresa: CodigoEmpresa) { return this.p.find((x) => x.empresa === empresa); }
  async supuestos() { return { monedaGrupo: "GTQ", wacc: "0.11", toleranciaIC: "100" }; }
  async impactoPorAlerta(_v: Version) { return []; }
}

/** Conecta con el backend real (hackaton_back). Probado contra su API el 21/11/2026. */
export class FuenteHttp implements FuenteDatos {
  constructor(private base = process.env.BACKEND_URL ?? "http://localhost:3000/api") {}
  private cache = new Map<string, Promise<any>>();
  private get(ruta: string, init?: RequestInit): Promise<any> {
    // Cache por pregunta: el agente consulta la misma ruta varias veces en una respuesta.
    const clave = ruta + (init?.body ?? "");
    if (!this.cache.has(clave)) {
      this.cache.set(clave, fetch(this.base + ruta, init).then(async (r) => {
        if (!r.ok) throw new Error(`Backend ${ruta} respondió ${r.status}`);
        return r.json();
      }));
      setTimeout(() => this.cache.delete(clave), 30_000);
    }
    return this.cache.get(clave)!;
  }
  private validacion(v: Version) { return this.get(`/validacion?version=${v}`); }
  /** Consolidado con todas las correcciones aplicadas e intercompañía aceptada (por referencia IC-xxxx). */
  private async corregido(version: Version) {
    const refs = (await this.validacion(version)).alertas
      .filter((a: any) => a.regla === "intercompania" && a.referencia).map((a: any) => a.referencia);
    return this.get("/escenario", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version, aplicarCorrecciones: "todas", aceptarIC: refs }),
    });
  }
  async consolidado(version: Version): Promise<Consolidado> {
    const [c, e] = await Promise.all([this.get(`/consolidado?version=${version}`), this.corregido(version)]);
    // empresas = cifras corregidas (igual que el mock); publicable = estado real de los datos.
    return { version, publicable: c.publicable, grupo: c.grupo, grupoCorregido: e.grupo ?? undefined, empresas: e.empresas };
  }
  async alertas() {
    const todas = new Map<string, Alerta>();
    for (const v of VERSIONES) {
      for (const a of (await this.validacion(v)).alertas) {
        if (!todas.has(a.id)) todas.set(a.id, { ...a, versiones: a.versiones ?? [v],
          ubicacion: [a.referencia, ...(a.filaIds ?? [])].filter(Boolean).join(", ") });
      }
    }
    return [...todas.values()];
  }
  async impacto(version: Version) {
    const [r, e] = await Promise.all([this.get(`/impacto-errores?version=${version}`), this.corregido(version)]);
    const grupoCon = (n: string) => r.items.flatMap((i: any) => i.indicadoresAfectados ?? [])
      .find((x: any) => x.nombre === n && x.nivel === "grupo")?.con ?? "";
    return { version, ebitConErrores: r.total.ebitConErrores, ebitCorregido: r.total.ebitCorregido,
      roicCon: grupoCon("roic"), roicSin: e.grupo?.roic ?? "", evaConErrores: grupoCon("eva"), evaCorregido: e.grupo?.eva?.valor ?? "" };
  }
  async impactoPorAlerta(version: Version) {
    return (await this.get(`/impacto-errores?version=${version}`)).items;
  }
  async puente(empresa: CodigoEmpresa) {
    return this.get(`/puente?empresa=${empresa}&metrica=ebit&desde=real_2025&hasta=ppto_2026`).catch(() => undefined);
  }
  async supuestos() {
    const p = (await this.get("/supuestos")).parametros ?? {};
    return { monedaGrupo: p.monedaGrupo ?? "GTQ", wacc: p.wacc ?? "0.11", toleranciaIC: p.toleranciaIC ?? "100" };
  }
}

export const fuente: FuenteDatos = process.env.FUENTE === "http" ? new FuenteHttp() : new FuenteMock();
