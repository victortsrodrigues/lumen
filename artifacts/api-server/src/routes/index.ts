import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import auditRouter from "./audit";
import membersRouter from "./members";
import financeRouter from "./finance";
import utilsRouter from "./utils";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/audit", auditRouter);
router.use("/members", membersRouter);
router.use("/finance", financeRouter);
router.use("/utils", utilsRouter);
router.use(storageRouter);

export default router;
