import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cargarAlertasFixture } from "../../src/fixtures";
import { cargarDataset } from "../../src/ingesta";
import { obtenerAlertas } from "../../src/pipeline";
import { validar } from "../../src/validador";

const natural = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });

function firma(alerta: { regla: string; severidad: string; filaIds: string[]; versiones: string[] }) {
  return {
    regla: alerta.regla,
    severidad: alerta.severidad,
    filaIds: [...alerta.filaIds].sort(natural),
    versiones: [...alerta.versiones].sort(),
  };
}

describe("validador", () => {
  const archivos = readdirSync(join(process.cwd(), "data"))
    .filter((nombre) => nombre.endsWith(".xlsx"))
    .map((nombre) => ({ nombre, buffer: readFileSync(join(process.cwd(), "data", nombre)) }));
  const dataset = cargarDataset(archivos);

  it("reproduce las alertas esperadas excepto intercompañía", () => {
    const got = validar(dataset).map(firma).sort((a, b) => natural(a.filaIds[0], b.filaIds[0]));
    const want = cargarAlertasFixture()
      .filter((a) => a.regla !== "intercompania")
      .map(firma)
      .sort((a, b) => natural(a.filaIds[0], b.filaIds[0]));
    expect(got).toEqual(want);
    for (const alerta of validar(dataset)) {
      expect(alerta.id).toBe("");
      expect(alerta.mensaje.length).toBeGreaterThan(0);
      expect(alerta.porQueImporta.length).toBeGreaterThan(0);
      expect(alerta.comoSeCorrige.length).toBeGreaterThan(0);
    }
  });

  it("el pipeline sigue numerando las 7 alertas del fixture", () => {
    const got = obtenerAlertas(dataset).map((a) => [a.id, a.regla, [...a.filaIds].sort(natural).join("|")]);
    const want = cargarAlertasFixture().map((a) => [a.id, a.regla, [...a.filaIds].sort(natural).join("|")]);
    expect(got).toEqual(want);
  });
});
