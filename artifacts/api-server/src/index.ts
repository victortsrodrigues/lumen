import app from "./app";
import { logger } from "./lib/logger";
import { ensureBootstrapAdmin } from "./lib/bootstrap";

const port = Number(process.env["PORT"] || "3000");

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env["PORT"]}"`);
}

ensureBootstrapAdmin().finally(() => {
  app.listen(port, () => {
    logger.info({ port }, "Server listening");
  });
});
