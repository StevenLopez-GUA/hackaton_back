import { readdirSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app";
import { cargarDatasetFixture } from "../../src/fixtures";
import { setDataset } from "../../src/estado";

let server: Server;
let base = "";

beforeAll(async () => {
  setDataset(cargarDatasetFixture());
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("sin puerto");
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  setDataset(cargarDatasetFixture());
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

describe("rutas A", () => {
  it("GET /empresas", async () => {
    const res = await fetch(`${base}/api/empresas`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(6);
    expect(body[0]).toEqual({
      codigo: "TRAC",
      nombre: "Tractores del Istmo, S.A.",
      pais: "Guatemala",
      moneda: "USD",
    });
  });

  it("GET /supuestos", async () => {
    const res = await fetch(`${base}/api/supuestos`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.parametros.monedaGrupo).toBe("GTQ");
    expect(body.parametros.wacc).toBe("0.1100");
    expect(body.parametros.toleranciaIC).toBe("100.00");
    expect(body.parametros.periodoCierre).toBe("2025-12-31");
    expect(body.parametros.anioPresupuesto).toBe(2026);
    expect(body.supuestos.length).toBeGreaterThan(0);
  });

  it("GET /tasas y PUT parcial", async () => {
    const antes = await fetch(`${base}/api/tasas`);
    expect(antes.status).toBe(200);
    const tasas = await antes.json();
    expect(tasas.MXN.promedio).toBe("2.3500");

    const put = await fetch(`${base}/api/tasas`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ MXN: { promedio: "2.40" } }),
    });
    expect(put.status).toBe(200);
    const actualizadas = await put.json();
    expect(actualizadas.MXN.promedio).toBe("2.4000");
    expect(actualizadas.MXN.cierre).toBe(tasas.MXN.cierre);

    const invalida = await fetch(`${base}/api/tasas`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ MXN: { promedio: "-1" } }),
    });
    expect(invalida.status).toBe(400);

    await fetch(`${base}/api/tasas`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ MXN: { promedio: "2.35" } }),
    });
  });

  it("GET /validacion filtra por versión", async () => {
    const mala = await fetch(`${base}/api/validacion?version=2025`);
    expect(mala.status).toBe(400);
    const res = await fetch(`${base}/api/validacion?version=ppto_2026`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.version).toBe("ppto_2026");
    expect(body.publicable).toBe(false);
    expect(body.resumen.bloqueantes).toBeGreaterThan(0);
    expect(body.alertas.every((a: { versiones: string[] }) => a.versiones.includes("ppto_2026"))).toBe(true);
    expect(body.alertas.some((a: { regla: string }) => a.regla === "signo")).toBe(true);
    expect(body.alertas.some((a: { regla: string }) => a.regla === "total")).toBe(false);
  });

  it("GET /registros filtra empresa, versión e ids", async () => {
    const id = "01_tractores_del_istmo_cierre2025.xlsx:Presupuesto:8:real_2025";
    const res = await fetch(`${base}/api/registros?empresa=TRAC&version=real_2025&ids=${encodeURIComponent(id)}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.registros).toHaveLength(1);
    expect(body.registros[0].id).toBe(id);
    expect(body.registros[0].monto).toBe("0.00");
    const mala = await fetch(`${base}/api/registros?version=no`);
    expect(mala.status).toBe(400);
  });

  it("POST /upload carga el paquete y rechaza un paquete sin 00_", async () => {
    const dir = join(process.cwd(), "data");
    const todos = readdirSync(dir).filter((n) => n.endsWith(".xlsx"));
    const form = new FormData();
    for (const nombre of todos) {
      form.append("archivos", new Blob([readFileSync(join(dir, nombre))]), nombre);
    }
    const res = await fetch(`${base}/api/upload`, { method: "POST", body: form });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalRegistros).toBe(213);
    expect(body.faltantes).toEqual([]);
    expect(body.alertas.bloqueantes).toBe(6);
    expect(body.alertas.advertencias).toBe(1);

    const incompleto = new FormData();
    const empresa = todos.find((n) => n.startsWith("01_"))!;
    incompleto.append("archivos", new Blob([readFileSync(join(dir, empresa))]), empresa);
    const rechazado = await fetch(`${base}/api/upload`, { method: "POST", body: incompleto });
    expect(rechazado.status).toBe(400);
    setDataset(cargarDatasetFixture());
  });
});
