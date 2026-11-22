import { convertir } from "../monedas";
import type { AvisoIngesta, CargarDataset, CodigoEmpresa, FilaIC, RegistroNormalizado, TotalDeclarado } from "../types";
import { leerLibro } from "./excel";
import { leerIntercompania } from "./intercompania";
import { leerParametros } from "./parametros";
import { leerPresupuesto } from "./presupuesto";
import { leerTotales } from "./totales";

export const cargarDataset: CargarDataset = (archivos) => {
  const parametrosArchivo = archivos.find((a) => a.nombre.startsWith("00_"));
  if (!parametrosArchivo) throw new Error("Falta el archivo de parámetros del grupo (00_).");

  const { empresas, tasas, parametros } = leerParametros(leerLibro(parametrosArchivo.buffer));
  const porNombre = new Map(archivos.map((a) => [a.nombre, a]));
  const faltantes: CodigoEmpresa[] = [];
  const registros: RegistroNormalizado[] = [];
  const intercompania: FilaIC[] = [];
  const totales: TotalDeclarado[] = [];
  const avisosIngesta: AvisoIngesta[] = [];

  for (const codigo of Object.keys(empresas) as CodigoEmpresa[]) {
    const empresa = empresas[codigo];
    const archivo = porNombre.get(empresa.archivo);
    if (!archivo) {
      faltantes.push(codigo);
      continue;
    }
    const libro = leerLibro(archivo.buffer);
    const presupuesto = leerPresupuesto(libro, archivo.nombre, codigo, empresas);
    const ic = leerIntercompania(libro, archivo.nombre, codigo, empresas);
    registros.push(...presupuesto.registros);
    intercompania.push(...ic.filasIc);
    totales.push(...leerTotales(libro, archivo.nombre, codigo));
    avisosIngesta.push(...presupuesto.avisos, ...ic.avisos);
  }

  return {
    empresas,
    tasas,
    parametros,
    registros: convertir(registros, tasas),
    intercompania,
    totales,
    faltantes,
    avisosIngesta,
  };
};
