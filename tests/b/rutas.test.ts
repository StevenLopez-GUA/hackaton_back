import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app";

let server: Server;
let base: string;

beforeAll(async () => {
  server = app.listen(0);
  await new Promise((ok) => server.once("listening", ok));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(() => server.close());

const get = async (ruta: string) => {
  const res = await fetch(base + ruta);
  return { status: res.status, body: (await res.json()) as any };
};

describe("GET /consolidado", () => {
  it("forma del ejemplo (real_2025 por defecto)", async () => {
    const { status, body } = await get("/consolidado");
    expect(status).toBe(200);
    expect(body.version).toBe("real_2025");
    expect(body.publicable).toBe(false);
    expect(body.grupo).toBeNull();
    const ferr = body.empresas.FERR;
    expect(ferr.conAlertas).toBe(false);
    expect(ferr.indicadores.ventas.valor).toBe("53850000.00");
    expect(ferr.indicadores.ebit.valor).toBe("4410000.00");
    expect(ferr.indicadores.nopat.valor).toBe("3432500.00");
    expect(ferr.indicadores.roic).toBe("0.1497");
    expect(ferr.indicadores.roce).toBe("0.2212");
    expect(ferr.indicadores.eva.valor).toBe("909925.00");
    expect(ferr.indicadores.ventas.origen).toHaveLength(2);
    expect(body.eliminacionesIC).toEqual({
      ventasEliminadas: "8500000.00",
      costosEliminados: "8305000.00",
      diferenciaNoConciliada: "195000.00",
    });
  });

  it("400 con versión inválida", async () => {
    const { status, body } = await get("/consolidado?version=2027");
    expect(status).toBe(400);
    expect(body.error.codigo).toBe("VERSION_INVALIDA");
  });
});

describe("GET /trazabilidad", () => {
  it("forma del ejemplo", async () => {
    const { status, body } = await get("/trazabilidad?metrica=ebit&nivel=grupo&version=real_2025");
    expect(status).toBe(200);
    expect(body).toMatchObject({ metrica: "ebit", nivel: "grupo", version: "real_2025", valor: "-386104.70" });
    expect(body.componentes[0]).toMatchObject({ nombre: "venta_ext", signo: "+", valor: "175000000.00" });
    expect(body.componentes[0].hijos.find((h: any) => h.nombre === "FERR")).toEqual({
      nombre: "FERR",
      valor: "52000000.00",
      origen: ["03_ferreteria_central_cierre2025.xlsx:Presupuesto:5:real_2025"],
    });
  });

  it("400 con métrica o nivel inválidos", async () => {
    expect((await get("/trazabilidad?metrica=xyz&nivel=grupo")).body.error.codigo).toBe("METRICA_INVALIDA");
    expect((await get("/trazabilidad?metrica=ebit&nivel=ZZZ")).body.error.codigo).toBe("NIVEL_INVALIDO");
    expect((await get("/trazabilidad?metrica=ebit")).status).toBe(400);
  });
});

describe("endpoints T6", () => {
  it("GET /impacto-errores", async () => {
    const { status, body } = await get("/impacto-errores?version=real_2025");
    expect(status).toBe(200);
    const a05 = body.items.find((i: any) => i.alertaId === "A-05");
    expect(a05).toMatchObject({ metrica: "ebit_grupo", valorConError: "-386104.70", valorSinError: "14350000.00", diferencia: "-14736104.70" });
    expect(a05.indicadoresAfectados).toContainEqual({ nombre: "roic", nivel: "grupo", con: "-0.0269", sin: "0.0963" });
    expect(body.total).toEqual({ ebitConErrores: "-386104.70", ebitCorregido: "14350000.00" });
  });

  it("GET /puente (ejemplo y 409)", async () => {
    const ok = await get("/puente?empresa=HERR&metrica=ebit&desde=real_2025&hasta=ppto_2026");
    expect(ok.body).toMatchObject({
      empresa: "HERR", metrica: "ebit", moneda: "MXN",
      desde: { version: "real_2025", local: "5311000.00", tasa: "2.35" },
      hasta: { version: "ppto_2026", local: "5571440.00" },
      base: "2260000.00", operativo: "110825.53", cambiario: "51539.69", nuevo: "2422365.22",
    });
    const conflicto = await get("/puente?empresa=CONC&metrica=ebit&desde=real_2025&hasta=ppto_2026");
    expect(conflicto.status).toBe(409);
    expect(conflicto.body.error.alerta.id).toBe("A-05");
    expect((await get("/puente?empresa=HERR&metrica=nopat&desde=real_2025&hasta=ppto_2026")).status).toBe(400);
  });

  it("POST /escenario", async () => {
    const res = await fetch(base + "/escenario", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version: "real_2025", aplicarCorrecciones: "todas", aceptarIC: ["IC-2025-03", "IC-2025-05"], tasas: { MXN: { promedio: "2.35" } } }),
    });
    const body: any = await res.json();
    expect(res.status).toBe(200);
    expect(body.publicable).toBe(true);
    expect(body.grupo.ebit.valor).toBe("14350000.00");
    expect(body.escenario).toEqual({ correccionesAplicadas: ["A-03", "A-05", "A-07"], icAceptadas: ["IC-2025-03", "IC-2025-05"], tasasEditadas: ["MXN.promedio"] });
    const mal = await fetch(base + "/escenario", { method: "POST", headers: { "content-type": "application/json" }, body: "{\"version\":\"x\"}" });
    expect(mal.status).toBe(400);
  });
});

describe("pedidos del front", () => {
  it("/consolidado trae wacc, ebitSinCorregir y moneda por empresa", async () => {
    const { body } = await get("/consolidado?version=real_2025");
    expect(body.wacc).toBe("0.1100");
    expect(body.ebitSinCorregir).toBe("-386104.70");
    expect(body.empresas.HERR.moneda).toBe("MXN");
  });

  it("POST /reset vuelve al dataset del reto", async () => {
    const put = await fetch(base + "/tasas", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ MXN: { promedio: "2.50" } }),
    });
    expect(put.status).toBe(200);
    expect((await get("/tasas")).body.MXN.promedio).toBe("2.5000");
    const reset = await fetch(base + "/reset", { method: "POST" });
    expect(await reset.json()).toEqual({ ok: true, totalRegistros: 213 });
    expect((await get("/tasas")).body.MXN.promedio).toBe("2.3500");
    expect((await get("/consolidado")).body.ebitSinCorregir).toBe("-386104.70");
  });
});
