// COMPARTIDO.
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import rutasA from "./routes/rutasA";
import rutasB from "./routes/rutasB";

export const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api", rutasA);
app.use("/api", rutasB);

app.use((_req, res) => res.status(404).json({ error: { codigo: "NO_ENCONTRADO", mensaje: "Ruta no existe" } }));
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: { codigo: "ERROR_INTERNO", mensaje: err.message } });
});
