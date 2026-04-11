import express, { type Express } from "express";
import path from "path";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { securityHeaders } from "./middlewares/security";

const app: Express = express();

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

  app.use(express.static(frontendPath));

  // SPA fallback — all non-API routes serve index.html
  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
  });
}

export default app;
