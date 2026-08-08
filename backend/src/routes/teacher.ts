import { Router } from "express";
import { teacherStudentsRouter } from "./teacher/students";

export const teacherRouter = Router();

teacherRouter.use(teacherStudentsRouter);
