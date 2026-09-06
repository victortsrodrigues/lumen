import { getStorageProvider, type StorageProvider } from "./storage/index.js";

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  private provider: StorageProvider;

  constructor() {
    this.provider = getStorageProvider();
  }

  async getObjectEntityUploadURL(fileName: string = "file", contentType: string = "application/octet-stream"): Promise<{
    uploadURL: string;
    objectPath: string;
  }> {
    return this.provider.generateUploadUrl(fileName, contentType);
  }

  async getObjectEntityFile(objectPath: string): Promise<{
    stream: NodeJS.ReadableStream;
    contentType: string;
    size?: number;
  }> {
    const exists = await this.provider.fileExists(objectPath);
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return this.provider.getFileStream(objectPath);
  }

  async fileExists(objectPath: string): Promise<boolean> {
    return this.provider.fileExists(objectPath);
  }

  async deleteObjectEntityFile(objectPath: string): Promise<void> {
    return this.provider.deleteFile(objectPath);
  }

  normalizeObjectEntityPath(rawPath: string): string {
    // If it's already a normalized path, return as-is
    if (rawPath.startsWith("/objects/") || rawPath.startsWith("/api/storage/upload-target/")) {
      return rawPath;
    }

    // Handle GCS URLs (production)
    if (rawPath.startsWith("https://storage.googleapis.com/")) {
      const url = new URL(rawPath);
      return `/objects${url.pathname}`;
    }

    return rawPath;
  }
}
