import isUser from "../middleware/authMiddleware.js";
import { getMyProfile,updateMyProfile } from "../controllers/profileController.js";

import express from "express";


const router = express.Router();

router.get("/me", isUser, getMyProfile);
router.put("/me", isUser, updateMyProfile);
export default router;