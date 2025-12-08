import express from "express";
import { addProduct, getAllProducts, getProduct, updateProduct, deleteProduct } from "../controllers/productController.js";
import verifyAdmin from "../middleware/verifyAdmin.js";

const router = express.Router();

// ADMIN
router.post("/", verifyAdmin, addProduct);
router.put("/:id", verifyAdmin, updateProduct);
router.delete("/:id", verifyAdmin, deleteProduct);

// PUBLIC
router.get("/", getAllProducts);
router.get("/:id", getProduct);

export default router;
