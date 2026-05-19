import { Router } from "express";
import { teacherStatsRouter } from "./teacher/stats";
import { teacherStudentsRouter } from "./teacher/students";
import { teacherTasksRouter } from "./teacher/tasks";
import { teacherPromptsRouter } from "./teacher/prompts";
import { teacherSettingsRouter } from "./teacher/settings";

export const teacherRouter = Router();

teacherRouter.use(teacherStatsRouter);
teacherRouter.use(teacherStudentsRouter);
teacherRouter.use(teacherTasksRouter);
teacherRouter.use(teacherPromptsRouter);
teacherRouter.use(teacherSettingsRouter);
