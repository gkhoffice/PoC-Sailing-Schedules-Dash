import { Router, type IRouter } from "express";
import healthRouter from "./health";
import schedulesRouter from "./schedules";

const router: IRouter = Router();

router.use(healthRouter);
router.use(schedulesRouter);

export default router;
