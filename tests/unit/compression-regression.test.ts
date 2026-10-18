import { once } from "node:events";
import {
  createServer,
  get,
  type IncomingMessage,
  type RequestListener,
  type ServerResponse,
} from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import type { Gzip } from "node:zlib";
import { describe, expect, it } from "vitest";

const apiRequire = createRequire(
  new URL("../../artifacts/api-server/package.json", import.meta.url),
);
const express = apiRequire("express");
const compression = apiRequire("compression");
const zlib: typeof import("node:zlib") = apiRequire("node:zlib");
const payload = "Lumen compression regression. ".repeat(100);

async function withServer(
  app: RequestListener,
  run: (base: URL) => Promise<void>,
) {
  const server = createServer(app);
  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const { port } = server.address() as AddressInfo;
    await run(new URL(`http://127.0.0.1:${port}`));
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  }
}

function getGzip(url: URL): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const request = get(
      url,
      {
        agent: false,
        headers: { "Accept-Encoding": "gzip" },
      },
      resolve,
    );
    request.once("error", reject);
    request.setTimeout(2_000, () =>
      request.destroy(new Error("Local response timed out")),
    );
  });
}

async function expectGzipPayload(url: URL) {
  const response = await getGzip(url);
  try {
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-encoding"]).toBe("gzip");
    const chunks: Buffer[] = [];
    for await (const chunk of response) chunks.push(Buffer.from(chunk));
    expect(zlib.gunzipSync(Buffer.concat(chunks)).toString()).toBe(payload);
  } finally {
    response.destroy();
  }
}

function createApp() {
  const app = express();
  app.use(compression());
  app.get(
    "/complete",
    (_request: IncomingMessage, response: ServerResponse) => {
      response.setHeader("Content-Type", "text/plain");
      response.end(payload);
    },
  );
  return app;
}

describe.sequential("compression response lifecycle", () => {
  it("preserves the payload in a complete gzip response", async () => {
    await withServer(createApp(), (base) =>
      expectGzipPayload(new URL("/complete", base)),
    );
  });

  it("closes the gzip stream when a client disconnects before the response ends", async () => {
    const original = Object.getOwnPropertyDescriptor(zlib, "createGzip")!;
    const createGzip = zlib.createGzip;
    const compressors: Gzip[] = [];
    // Observe real streams through the public factory; do not inspect native handles.
    Object.defineProperty(zlib, "createGzip", {
      ...original,
      value: (...args: Parameters<typeof createGzip>) => {
        const stream = createGzip(...args);
        compressors.push(stream);
        return stream;
      },
    });

    try {
      const app = createApp();
      let serverResponse: ServerResponse | undefined;
      let responseClosed: Promise<unknown> | undefined;
      app.get(
        "/stream",
        (
          _request: IncomingMessage,
          response: ServerResponse & { flush(): void },
        ) => {
          serverResponse = response;
          responseClosed = once(response, "close", {
            signal: AbortSignal.timeout(2_000),
          });
          response.setHeader("Content-Type", "text/plain");
          response.write(payload);
          response.flush();
          // One small chunk, deliberately unfinished until the client disconnects.
        },
      );

      await withServer(app, async (base) => {
        const response = await getGzip(new URL("/stream", base));
        try {
          expect(response.headers["content-encoding"]).toBe("gzip");
          await once(response, "data", { signal: AbortSignal.timeout(2_000) });
          expect(compressors).toHaveLength(1);
          expect(compressors[0].destroyed).toBe(false);
          response.destroy();
          await responseClosed;
          expect(serverResponse?.writableEnded).toBe(false);
          expect(compressors[0].destroyed).toBe(true);
          if (!compressors[0].closed) {
            await once(compressors[0], "close", {
              signal: AbortSignal.timeout(2_000),
            });
          }
          expect(compressors[0].closed).toBe(true);
          await expectGzipPayload(new URL("/complete", base));
        } finally {
          response.destroy();
        }
      });
    } finally {
      for (const stream of compressors) stream.destroy();
      Object.defineProperty(zlib, "createGzip", original);
    }
  });
});
