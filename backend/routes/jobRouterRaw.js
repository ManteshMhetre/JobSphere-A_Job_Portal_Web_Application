import express from "express";
import {
  deleteJob,
  getAllJobs,
  getASingleJob,
  getMyJobs,
  postJob,
} from "../controllers/jobControllerRaw.js";
import { isAuthenticated } from "../middlewares/authRaw.js";

const router = express.Router();

router.post("/post", isAuthenticated, postJob);
router.get("/getall", getAllJobs);
router.get("/getmyjobs", isAuthenticated, getMyJobs);
router.delete("/delete/:id", isAuthenticated, deleteJob);
router.get("/get/:id", isAuthenticated, getASingleJob);

export default router;
