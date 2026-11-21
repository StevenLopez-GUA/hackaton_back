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
