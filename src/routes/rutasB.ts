// PERSONA B. Endpoints de cálculo.
import { Router } from "express";
import { noImplementado } from "../http";

const r = Router();

r.get("/consolidado", noImplementado);
r.get("/trazabilidad", noImplementado);
r.get("/impacto-errores", noImplementado);
r.get("/puente", noImplementado);
r.post("/escenario", noImplementado);

export default r;
