import type { Readable } from "stream";

export interface StorageProvider {
  /** Generate an upload URL and the normalized object path to store in DB */
  generateUploadUrl(fileName: string, contentType: string): Promise<{
    uploadURL: string;
    objectPath: string;
  }>;

  /** Get a readable stream for a stored file */
  getFileStream(objectPath: string): Promise<{
    stream: Readable;
    contentType: string;
    size?: number;
  }>;

  /** Check if a file exists at the given path */
  fileExists(objectPath: string): Promise<boolean>;

  /** Permanently delete a stored file. Missing files are treated as deleted. */
  deleteFile(objectPath: string): Promise<void>;
}
