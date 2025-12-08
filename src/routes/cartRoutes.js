import express from "express";
import {
  addToCart,
  getUserCart,
  updateCartItem,
  deleteCartItem,
} from "../controllers/cartController.js";
import  isUser  from "../middleware/authMiddleware.js";

const router = express.Router();

// All routes now require authentication
router.post("/", isUser, addToCart);
router.get("/", isUser, getUserCart);
router.put("/update", isUser, updateCartItem);
router.delete("/delete", isUser, deleteCartItem);

export default router;
