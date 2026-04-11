import app from "./app";
import { logger } from "./lib/logger";

const port = Number(process.env["PORT"] || "3000");

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env["PORT"]}"`);
}

app.listen(port, () => {
  logger.info({ port }, "Server listening");
});
