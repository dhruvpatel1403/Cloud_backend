import express from "express";
import {
  placeOrder,
  getUserOrders,
  deleteOrder,
//   updateOrderStatus,
} from "../controllers/orderController.js";
import isUser from "../middleware/authMiddleware.js";

const router = express.Router();

// Create a new order
router.post("/",isUser , placeOrder);

// Get all orders for a user
router.get("/",isUser, getUserOrders);

router.delete("/:orderId", isUser, deleteOrder);


// Update order status
// router.put("/:orderId",isUser, updateOrderStatus);

export default router;
