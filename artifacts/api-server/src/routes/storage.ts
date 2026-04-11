import { Router, type IRouter, type Request, type Response } from "express";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage.js";
import { requireAuth } from "../middlewares/auth.js";
import { LocalStorageProvider } from "../lib/storage/localStorageProvider.js";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/**
 * POST /storage/uploads/request-url
 *
 * Request an upload URL. Returns { uploadURL, objectPath }.
 * In local mode, uploadURL points to /api/storage/upload-target/:id
 * In cloud mode, uploadURL is a presigned cloud storage URL.
 */
router.post("/storage/uploads/request-url", requireAuth, async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;

    const { uploadURL, objectPath } = await objectStorageService.getObjectEntityUploadURL(name, contentType);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * PUT /storage/upload-target/:objectId
 *
 * Receive file upload directly (local storage mode).
 * The frontend PUTs the file body to this URL after getting it from request-url.
 */
router.put("/storage/upload-target/:objectId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { objectId } = req.params;

    // Validate objectId (prevent path traversal)
    if (!objectId || objectId.includes("..") || objectId.includes("/")) {
      res.status(400).json({ error: "Invalid object ID" });
      return;
    }

    const uploadDir = process.env.UPLOAD_DIR || "./uploads";
    const uploadsSubdir = path.resolve(uploadDir, "uploads");
    if (!existsSync(uploadsSubdir)) {
      mkdirSync(uploadsSubdir, { recursive: true });
    }

    const filePath = path.resolve(uploadsSubdir, objectId);

    // Collect the raw body
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const fileBuffer = Buffer.concat(chunks);

    writeFileSync(filePath, fileBuffer);

    res.json({ ok: true, path: `/objects/uploads/${objectId}` });
  } catch (error) {
    req.log.error({ err: error }, "Error saving uploaded file");
    res.status(500).json({ error: "Failed to save file" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve stored files (photos, receipts, etc).
 */
router.get("/storage/objects/*objectPath", async (req: Request, res: Response) => {
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
