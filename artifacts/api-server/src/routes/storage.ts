import { Router, type IRouter, type Request, type Response } from "express";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage.js";
import { requireAuth } from "../middlewares/auth.js";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/**
 * POST /storage/uploads/request-url
 *
 * Uploads are disabled while the application does not have persistent private
 * object storage. Kept as an explicit response for older clients.
 */
router.post("/storage/uploads/request-url", requireAuth, (_req: Request, res: Response) => {
  res.status(410).json({
    error: "UPLOADS_DISABLED",
    message: "O envio de arquivos está temporariamente desativado.",
  });
});

/**
 * PUT /storage/upload-target/:objectId
 *
 * Local upload target disabled. Existing stored objects remain readable below
 * for backwards compatibility.
 */
router.put("/storage/upload-target/:objectId", requireAuth, (_req: Request<{ objectId: string }>, res: Response) => {
  res.status(410).json({
    error: "UPLOADS_DISABLED",
    message: "O envio de arquivos está temporariamente desativado.",
  });
});

/**
 * GET /storage/objects/*
 *
 * Serve stored files (photos, receipts, etc).
 */
router.get("/storage/objects/*objectPath", requireAuth, async (req: Request, res: Response) => {
  try {
    const raw = req.params.objectPath;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;

    const { stream, contentType, size } = await objectStorageService.getObjectEntityFile(objectPath);

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    if (size) {
      res.setHeader("Content-Length", String(size));
    }

    (stream as NodeJS.ReadableStream).pipe(res);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
