import { Router, type IRouter, Request, Response } from "express";
import { requireAuth } from "../middlewares/auth.js";

const router: IRouter = Router();

router.get("/cep/:cep", requireAuth, async (req: Request, res: Response) => {
  const cep = req.params.cep.replace(/\D/g, "");
  if (cep.length !== 8) {
    res.status(400).json({ error: "INVALID_CEP", message: "CEP inválido" });
    return;
  }

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (!response.ok) {
      res.status(404).json({ error: "CEP_NOT_FOUND", message: "CEP não encontrado" });
      return;
    }
    const data = await response.json() as Record<string, unknown>;
    if (data.erro) {
      res.status(404).json({ error: "CEP_NOT_FOUND", message: "CEP não encontrado" });
      return;
    }
    res.json({
      zip: cep,
      street: data.logradouro || "",
      neighborhood: data.bairro || "",
      city: data.localidade || "",
      state: data.uf || "",
    });
  } catch {
    res.status(500).json({ error: "CEP_LOOKUP_FAILED", message: "Falha na busca do CEP" });
  }
});

export default router;
