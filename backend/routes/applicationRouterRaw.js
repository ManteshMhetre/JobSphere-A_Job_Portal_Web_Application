import express from "express";
import {
  deleteApplication,
  employerGetAllApplication,
  jobSeekerGetAllApplication,
  postApplication,
} from "../controllers/applicationControllerRaw.js";
import { isAuthenticated } from "../middlewares/authRaw.js";

const router = express.Router();

router.post("/post/:id", isAuthenticated, postApplication);
router.get("/employer/getall", isAuthenticated, employerGetAllApplication);
router.get("/jobseeker/getall", isAuthenticated, jobSeekerGetAllApplication);
router.delete("/delete/:id", isAuthenticated, deleteApplication);

export default router;
