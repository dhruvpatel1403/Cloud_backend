import express from "express";
import {
  addProduct,
  getAllProducts,
  getProduct,
  updateProduct,
  deleteProduct,
  getMyProducts,        // 🔥 NEW
   // 🔥 OPTIONAL: If you want category filtering
} from "../controllers/productController.js";

import verifyAdmin from "../middleware/verifyAdmin.js";

const router = express.Router();

/**
 * ADMIN ROUTES (Store Managers)
 * These must only access their own products.
 */

// Add a new product (owned by Admin)
router.post("/", verifyAdmin, addProduct);

// Update product (only if product.ownerId === adminSub)
router.put("/:id", verifyAdmin, updateProduct);

// Delete product (same restriction)
router.delete("/:id", verifyAdmin, deleteProduct);

// 🔥 NEW: Get all products created by the logged-in admin (store manager)
router.get("/admin/mine", verifyAdmin, getMyProducts);


/**
 * PUBLIC ROUTES (Customers)
 */

// Get all products (no login required)
router.get("/", getAllProducts);

// Optional: Filter by category for customers

// Get single product by ID
router.get("/:id", getProduct);

export default router;
