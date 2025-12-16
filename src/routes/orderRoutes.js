import express from "express";
import {
  placeOrder,
  getUserOrders,
  deleteOrder,
   updateOrderStatus,
getOrdersForMyStore,
getStoreDashboardStats
} from "../controllers/orderController.js";
import isUser from "../middleware/authMiddleware.js";

import verifyAdmin from "../middleware/verifyAdmin.js";


const router = express.Router();

// Create a new order
router.post("/",isUser , placeOrder);

// Get all orders for a user
router.get("/",isUser, getUserOrders);

router.delete("/:orderId", isUser, deleteOrder);

router.get("/my-orders", verifyAdmin, getOrdersForMyStore);

router.patch("/:orderId/status", verifyAdmin, updateOrderStatus);

router.get("/dashboard/", verifyAdmin,getStoreDashboardStats);

export default router;

