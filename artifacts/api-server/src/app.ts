import express, { type Express, type Request, type Response, type NextFunction } from "express";
import path from "path";
import cors from "cors";
import cookieParser from "cookie-parser";
import compression from "compression";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { securityHeaders } from "./middlewares/security";

const app: Express = express();

// Gzip/deflate todas as responses (HTML, JS, CSS, JSON)
app.use(compression());

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(securityHeaders);
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Production: serve frontend static files
if (process.env.NODE_ENV === "production") {
  // In production build (dist/index.cjs), __dirname is artifacts/api-server/dist
  // Frontend build is at artifacts/church-erp/dist/public
  const frontendPath = path.resolve(process.cwd(), "artifacts/church-erp/dist/public");

  // Assets com hash no nome (gerados pelo Vite) são imutáveis — cache 1 ano.
  // Cobre /assets/index-XXX.js, /assets/index-XXX.css, etc.
  app.use("/assets", (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    next();
  });

  app.use(express.static(frontendPath, {
    // index.html não cacheia (precisa atualizar para apontar pros novos hashes)
    setHeaders: (res, filePath) => {
      if (filePath.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  }));

  // SPA fallback — all non-API routes serve index.html
  app.get("/{*path}", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(frontendPath, "index.html"));
  });
}

export default app;
