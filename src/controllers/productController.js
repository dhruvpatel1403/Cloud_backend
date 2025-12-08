import {
  PutCommand,
  GetCommand,
  ScanCommand,
  DeleteCommand,
  UpdateCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";

import ddb from "../dynamo.js";
import { v4 as uuidv4 } from "uuid";

const TABLE = process.env.PRODUCTS_TABLE || "Products";

// ------------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------------

const parseLastKey = (lastKey) => {
  if (!lastKey) return undefined;
  try {
    return JSON.parse(Buffer.from(lastKey, "base64").toString("utf8"));
  } catch {
    return undefined;
  }
};

const encodeLastKey = (key) => {
  if (!key) return undefined;
  return Buffer.from(JSON.stringify(key)).toString("base64");
};

const sortItems = (items, sortBy = "createdAt", order = "desc") => {
  const dir = order === "asc" ? 1 : -1;
  return items.sort((a, b) => {
    const va = a[sortBy];
    const vb = b[sortBy];

    if (va === undefined && vb === undefined) return 0;
    if (va === undefined) return 1 * dir;
    if (vb === undefined) return -1 * dir;

    if (!isNaN(Date.parse(va)) && !isNaN(Date.parse(vb))) {
      return (new Date(va) - new Date(vb)) * dir;
    }

    if (typeof va === "number" && typeof vb === "number") {
      return (va - vb) * dir;
    }

    return String(va).localeCompare(String(vb)) * dir;
  });
};

/** Admin/store manager only manages products where ownerId = req.user.sub */
const canManage = (reqUser, product) => {
  return reqUser?.role === "admin" && reqUser?.sub === product?.ownerId;
};

// ------------------------------------------------------------------------------------
// Get products for current admin
// ------------------------------------------------------------------------------------

export const getMyProducts = async (req, res) => {
  try {
    if (!req.user || !req.user.sub) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const ownerId = req.user.sub;

    // Use Scan + FilterExpression (works without GSI)
    const result = await ddb.send(
      new ScanCommand({
        TableName: TABLE,
        FilterExpression: "ownerId = :id",
        ExpressionAttributeValues: {
          ":id": ownerId,
        },
      })
    );

    return res.status(200).json(result.Items || []);
  } catch (err) {
    console.error("Error fetching admin products:", err);
    return res.status(500).json({ message: "Unable to fetch admin products", error: err.message });
  }
};

// ------------------------------------------------------------------------------------
// Add Product
// ------------------------------------------------------------------------------------

export const addProduct = async (req, res) => {
  try {
    const ownerId = req.user?.sub;

    if (!ownerId)
      return res.status(400).json({ message: "Missing authenticated owner" });

    const {
      title,
      imageUrl,
      description,
      price,
      category,
      brand,
      stock,
      metadata,
    } = req.body;

    if (!title || !imageUrl || !description || price === undefined || stock === undefined) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const numericPrice = Number(price);
    const numericStock = Number(stock);

    if (numericPrice < 0 || isNaN(numericPrice))
      return res.status(400).json({ message: "Price must be non-negative" });

    if (!Number.isInteger(numericStock) || numericStock < 0)
      return res.status(400).json({ message: "Stock must be a non-negative integer" });

    const product = {
      productId: uuidv4(),
      title,
      imageUrl,
      description,
      price: numericPrice,
      stock: numericStock,
      category: category || "General",
      brand: brand || "Generic",
      rating: 0,
      reviews: [],
      metadata: metadata || {},
      ownerId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await ddb.send(new PutCommand({ TableName: TABLE, Item: product }));

    return res.status(201).json({
      message: "Product added successfully",
      product,
    });
  } catch (err) {
    console.error("Add product error:", err);
    return res.status(500).json({ message: "Error adding product" });
  }
};

// ------------------------------------------------------------------------------------
// Public: get all products (filters + sort + pagination)
// ------------------------------------------------------------------------------------

export const getAllProducts = async (req, res) => {
  try {
    const {
      sortBy = "createdAt",
      order = "desc",
      limit = "50",
      lastKey,
      q,
      category,
      brand,
      ownerId,  // optional filter
    } = req.query;

    const filterExp = [];
    const values = {};

    if (category) {
      filterExp.push("category = :cat");
      values[":cat"] = category;
    }

    if (brand) {
      filterExp.push("brand = :br");
      values[":br"] = brand;
    }

    if (ownerId) {
      filterExp.push("ownerId = :oid");
      values[":oid"] = ownerId;
    }

    if (q) {
      filterExp.push("(contains(title, :q) OR contains(description, :q))");
      values[":q"] = q;
    }

    const params = {
      TableName: TABLE,
      Limit: Number(limit),
      ExclusiveStartKey: parseLastKey(lastKey),
    };

    if (filterExp.length) {
      params.FilterExpression = filterExp.join(" AND ");
      params.ExpressionAttributeValues = values;
    }

    const result = await ddb.send(new ScanCommand(params));
    const sorted = sortItems(result.Items || [], sortBy, order);

    return res.json({
      items: sorted,
      lastKey: encodeLastKey(result.LastEvaluatedKey),
      count: sorted.length,
    });
  } catch (err) {
    console.error("Get products error:", err);
    return res.status(500).json({ message: "Error fetching products" });
  }
};

// ------------------------------------------------------------------------------------
// Get single product
// ------------------------------------------------------------------------------------

export const getProduct = async (req, res) => {
  try {
    const result = await ddb.send(
      new GetCommand({
        TableName: TABLE,
        Key: { productId: req.params.id },
      })
    );

    if (!result.Item) return res.status(404).json({ message: "Product not found" });

    return res.json(result.Item);
  } catch (err) {
    console.error("Get product error:", err);
    return res.status(500).json({ message: "Error fetching product" });
  }
};

// ------------------------------------------------------------------------------------
// Update product (admin owns it)
// ------------------------------------------------------------------------------------

export const updateProduct = async (req, res) => {
  try {
    const productId = req.params.id;

    const current = await ddb.send(
      new GetCommand({
        TableName: TABLE,
        Key: { productId },
      })
    );

    if (!current.Item) return res.status(404).json({ message: "Product not found" });

    if (!canManage(req.user, current.Item))
      return res.status(403).json({ message: "Not authorized" });

    const fields = req.body;
    const updates = [];
    const values = {};
    const names = {};

    for (const key of ["title", "imageUrl", "description", "category", "brand", "metadata"]) {
      if (fields[key] !== undefined) {
        names[`#${key}`] = key;
        values[`:${key}`] = fields[key];
        updates.push(`#${key} = :${key}`);
      }
    }

    if (fields.price !== undefined) {
      const p = Number(fields.price);
      if (p < 0 || isNaN(p)) return res.status(400).json({ message: "Invalid price" });
      values[":price"] = p;
      updates.push("price = :price");
    }

    if (fields.stock !== undefined) {
      const s = Number(fields.stock);
      if (!Number.isInteger(s) || s < 0)
        return res.status(400).json({ message: "Invalid stock" });
      values[":stock"] = s;
      updates.push("stock = :stock");
    }

    updates.push("updatedAt = :u");
    values[":u"] = new Date().toISOString();

    const updateResult = await ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { productId },
        UpdateExpression: "SET " + updates.join(", "),
        ExpressionAttributeValues: values,
        ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
        ReturnValues: "ALL_NEW",
      })
    );

    return res.json({
      message: "Product updated",
      product: updateResult.Attributes,
    });
  } catch (err) {
    console.error("Update product error:", err);
    return res.status(500).json({ message: "Error updating product" });
  }
};

// ------------------------------------------------------------------------------------
// Delete product
// ------------------------------------------------------------------------------------

export const deleteProduct = async (req, res) => {
  try {
    const productId = req.params.id;

    const existing = await ddb.send(
      new GetCommand({
        TableName: TABLE,
        Key: { productId },
      })
    );

    if (!existing.Item) return res.status(404).json({ message: "Not found" });

    if (!canManage(req.user, existing.Item))
      return res.status(403).json({ message: "Not authorized" });

    await ddb.send(
      new DeleteCommand({
        TableName: TABLE,
        Key: { productId },
      })
    );

    return res.json({ message: "Product deleted successfully" });
  } catch (err) {
    console.error("Delete error:", err);
    return res.status(500).json({ message: "Error deleting product" });
  }
};
