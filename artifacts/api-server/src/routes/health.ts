import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    // Verify the schema needed by authentication too. A live connection alone
    // must not mark a deployment healthy when db:push did not apply changes.
    await pool.query(
      "SELECT status, member_id, session_version FROM users LIMIT 0",
    );

    const data = HealthCheckResponse.parse({ status: "ok" });
    res.status(200).json(data);
  } catch (err) {
    logger.error({ err }, "Database health check failed");
    const data = HealthCheckResponse.parse({ status: "error" });
    res.status(503).json(data);
  }
});

export default router;
