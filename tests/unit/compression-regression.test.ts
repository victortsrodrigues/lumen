import { once } from "node:events";
import {
  createServer,
  get,
  request,
  type IncomingMessage,
  type RequestListener,
  type ServerResponse,
} from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import type { Gzip, Inflate } from "node:zlib";
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

describe.sequential("compressed request body lifecycle", () => {
  for (const [contentType, body] of [
    ["application/json", JSON.stringify({ name: "João Lumen" })],
    [
      "application/x-www-form-urlencoded",
      new URLSearchParams({ name: "João Lumen" }).toString(),
    ],
  ]) {
    it(`closes the decoder after parsing a compressed body (${contentType})`, async () => {
      const original = Object.getOwnPropertyDescriptor(zlib, "createInflate")!;
      const createInflate = zlib.createInflate;
      const decoders: Inflate[] = [];
      Object.defineProperty(zlib, "createInflate", {
        ...original,
        value: (...args: Parameters<typeof createInflate>) => {
          const stream = createInflate(...args);
          decoders.push(stream);
          return stream;
        },
      });
      try {
        const app = express();
        // Match the two parsers used by the production app, with default options.
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));
        app.post(
          "/",
          (req: { body: unknown }, res: { json(body: unknown): void }) =>
            res.json(req.body),
        );
        app.get("/", (_req: unknown, res: { json(body: unknown): void }) =>
          res.json({ status: "ok" }),
        );
        await withServer(app, async (base) => {
          const parsed = await new Promise<unknown>((resolve, reject) => {
            const client = request(
              base,
              {
                method: "POST",
                agent: false,
                headers: {
                  "Content-Type": contentType,
                  "Content-Encoding": "deflate",
                },
              },
              async (response) => {
                try {
                  expect(response.statusCode).toBe(200);
                  // GHSA-27r3-jxmh-p828: successful parsing must not leave a live,
                  // unguarded decoder that can fail on bytes arriving afterwards.
                  expect(decoders).toHaveLength(1);
                  expect(decoders[0].destroyed).toBe(true);
                  const chunks: Buffer[] = [];
                  for await (const chunk of response)
                    chunks.push(Buffer.from(chunk));
                  resolve(JSON.parse(Buffer.concat(chunks).toString()));
                } catch (error) {
                  client.destroy();
                  reject(error);
                }
              },
            );
            client.on("error", reject);
            client.setTimeout(2_000, () =>
              client.destroy(new Error("Local request timed out")),
            );
            client.end(zlib.deflateSync(body));
          });
          expect(parsed).toEqual({ name: "João Lumen" });
          const response = await fetch(base);
          expect(await response.json()).toEqual({ status: "ok" });
        });
      } finally {
        for (const decoder of decoders) decoder.destroy();
        Object.defineProperty(zlib, "createInflate", original);
      }
    });
  }
});
