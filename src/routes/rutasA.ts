// PERSONA A. Endpoints de entrada, validación y extras.
import { Router } from "express";
import multer from "multer";
import { noImplementado } from "../http";

export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 10 } });
const r = Router();

r.post("/upload", upload.array("archivos"), noImplementado);
r.get("/empresas", noImplementado);
r.get("/supuestos", noImplementado);
r.get("/tasas", noImplementado);
r.put("/tasas", noImplementado);
r.get("/validacion", noImplementado);
r.get("/registros", noImplementado);
r.get("/sensibilidad", noImplementado);
r.post("/explicar", noImplementado);

export default r;
