import {
  PutCommand,
  GetCommand,
  ScanCommand,
  DeleteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import ddb from "../dynamo.js";
import { v4 as uuidv4 } from "uuid";


// --------------------- ADD PRODUCT (ADMIN) ---------------------
export const addProduct = async (req, res) => {
  try {
    const { title, imageUrl, description, price, category, brand, stock } = req.body;

    if (!title || !imageUrl || !description || !price || !stock) {
      return res.status(400).json({ message: "Title, imageUrl, description, price, and stock are required" });
    }

    const productId = uuidv4();
    const timestamp = new Date().toISOString();

    const newProduct = {
      productId,
      title,
      imageUrl,
      description,
      price,
      category: category || "General",
      brand: brand || "Generic",
      stock,
      rating: 0,
      reviews: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await ddb.send(
      new PutCommand({
        TableName: process.env.PRODUCTS_TABLE || "Products",
        Item: newProduct,
      })
    );

    return res.status(201).json({
      message: "Product added successfully",
      product: newProduct,
    });
  } catch (err) {
    console.error("Add product error:", err);
    return res.status(500).json({ message: "Error adding product", error: err.message });
  }
};

// --------------------- GET ALL PRODUCTS ---------------------
export const getAllProducts = async (req, res) => {
  try {
    const result = await ddb.send(
      new ScanCommand({
        TableName: process.env.PRODUCTS_TABLE || "Products",
      })
    );

    return res.status(200).json(result.Items || []);
  } catch (err) {
    console.error("Get products error:", err);
    return res.status(500).json({ message: "Error fetching products", error: err.message });
  }
};

// --------------------- GET ONE PRODUCT ---------------------
export const getProduct = async (req, res) => {
  try {
    const result = await ddb.send(
      new GetCommand({
        TableName: process.env.PRODUCTS_TABLE || "Products",
        Key: { productId: req.params.id },
      })
    );

    return res.status(200).json(result.Item || {});
  } catch (err) {
    console.error("Get product error:", err);
    return res.status(500).json({ message: "Error fetching product", error: err.message });
  }
};

// --------------------- UPDATE PRODUCT (ADMIN) ---------------------
export const updateProduct = async (req, res) => {
  try {
    const { title, imageUrl, description, price, category, brand, stock } = req.body;

    if (!title || !imageUrl || !description || !price || stock === undefined) {
      return res.status(400).json({ message: "Title, imageUrl, description, price, and stock are required" });
    }

    const updatedAt = new Date().toISOString();

    await ddb.send(
      new UpdateCommand({
        TableName: process.env.PRODUCTS_TABLE || "Products",
        Key: { productId: req.params.id },
        UpdateExpression: "SET title = :t, imageUrl = :i, description = :d, price = :p, category = :c, brand = :b, stock = :s, updatedAt = :u",
        ExpressionAttributeValues: {
          ":t": title,
          ":i": imageUrl,
          ":d": description,
          ":p": price,
          ":c": category || "General",
          ":b": brand || "Generic",
          ":s": stock,
          ":u": updatedAt,
        },
      })
    );

    return res.status(200).json({ message: "Product updated successfully" });
  } catch (err) {
    console.error("Update product error:", err);
    return res.status(500).json({ message: "Error updating product", error: err.message });
  }
};

// --------------------- DELETE PRODUCT (ADMIN) ---------------------
export const deleteProduct = async (req, res) => {
  try {
    await ddb.send(
      new DeleteCommand({
        TableName: process.env.PRODUCTS_TABLE || "Products",
        Key: { productId: req.params.id },
      })
    );

    return res.status(200).json({ message: "Product deleted successfully" });
  } catch (err) {
    console.error("Delete product error:", err);
    return res.status(500).json({ message: "Error deleting product", error: err.message });
  }
};
