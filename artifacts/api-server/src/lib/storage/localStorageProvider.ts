import { createReadStream, existsSync, mkdirSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { lookup } from "mime-types";
import type { Readable } from "stream";
import type { StorageProvider } from "./types.js";

export class LocalStorageProvider implements StorageProvider {
  private uploadDir: string;

  constructor(uploadDir?: string) {
    this.uploadDir = uploadDir || process.env.UPLOAD_DIR || "./uploads";
    // Ensure upload directory exists
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async generateUploadUrl(fileName: string, _contentType: string): Promise<{
    uploadURL: string;
    objectPath: string;
  }> {
    const ext = path.extname(fileName);
    const objectId = `${randomUUID()}${ext}`;
    const objectPath = `/objects/uploads/${objectId}`;

    // Return relative URL — Vite proxy forwards to backend
    const uploadURL = `/api/storage/upload-target/${objectId}`;

    return { uploadURL, objectPath };
  }

  async getFileStream(objectPath: string): Promise<{
    stream: Readable;
    contentType: string;
    size?: number;
  }> {
    const filePath = this.resolveFilePath(objectPath);

    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${objectPath}`);
    }

    const { statSync } = await import("fs");
    const stat = statSync(filePath);
    const contentType = lookup(filePath) || "application/octet-stream";

    return {
      stream: createReadStream(filePath),
      contentType,
      size: stat.size,
    };
  }

  async fileExists(objectPath: string): Promise<boolean> {
    const filePath = this.resolveFilePath(objectPath);
    return existsSync(filePath);
  }

  /** Get the absolute filesystem path for a given objectPath */
  getAbsolutePath(objectId: string): string {
    return path.resolve(this.uploadDir, objectId);
  }

  private resolveFilePath(objectPath: string): string {
    // objectPath is like "/objects/uploads/abc-123.jpg"
    // Strip the leading "/objects/" prefix
    let relative = objectPath;
    if (relative.startsWith("/objects/")) {
      relative = relative.slice("/objects/".length);
    }
    const resolved = path.resolve(this.uploadDir, relative);

    // Prevent path traversal
    const normalizedUploadDir = path.resolve(this.uploadDir);
    if (!resolved.startsWith(normalizedUploadDir)) {
      throw new Error("Invalid object path: path traversal detected");
    }

    return resolved;
  }
}
