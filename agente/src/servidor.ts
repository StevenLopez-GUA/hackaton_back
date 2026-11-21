import express from "express";
import { preguntar, explicar, informe } from "./agente.js";

const app = express();
app.use(express.json());
app.use((_, res, next) => { res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Headers", "Content-Type"); next(); });
app.options("*splat", (_, res) => res.sendStatus(204));

const err = (res: express.Response, codigo: string, mensaje: string) => res.status(400).json({ error: { codigo, mensaje } });

app.post("/agente/preguntar", async (req, res) => {
  const pregunta = req.body?.pregunta;
  if (typeof pregunta !== "string" || !pregunta.trim()) return err(res, "pregunta_vacia", "Envía { \"pregunta\": \"...\" }");
  res.json(await preguntar(pregunta));
});

// Mismo contrato que POST /api/explicar del backend v3.
app.post("/api/explicar", async (req, res) => {
  const b = req.body ?? {};
  if (b.tipo === "alerta" && b.id) return res.json(await explicar({ tipo: "alerta", id: b.id }));
  if (b.tipo === "puente" && b.empresa) return res.json(await explicar({ tipo: "puente", empresa: b.empresa }));
  err(res, "pedido_invalido", "Usa { tipo: \"alerta\", id } o { tipo: \"puente\", empresa }");
});

app.get("/agente/informe", async (_, res) => res.json(await informe()));

const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, () => console.log(`Agente escuchando en http://localhost:${PORT}`));
