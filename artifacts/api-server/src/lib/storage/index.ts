import type { StorageProvider } from "./types.js";
import { LocalStorageProvider } from "./localStorageProvider.js";

export type { StorageProvider } from "./types.js";
export { LocalStorageProvider } from "./localStorageProvider.js";

let _provider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (!_provider) {
    const providerType = process.env.STORAGE_PROVIDER || "local";

    switch (providerType) {
      case "local":
        _provider = new LocalStorageProvider();
        break;
      // Future: case "cloud": _provider = new CloudStorageProvider(); break;
      default:
        throw new Error(`Unknown STORAGE_PROVIDER: ${providerType}. Use "local" or "cloud".`);
    }
  }
  return _provider;
}
