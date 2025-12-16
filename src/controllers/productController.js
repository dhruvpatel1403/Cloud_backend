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
  title: title.toLowerCase(),
  imageUrl,
  description: description.toLowerCase(),
  price: numericPrice,
  stock: numericStock,
  category: (category || "General").toLowerCase(),
  brand: (brand || "Generic").toLowerCase(),
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
    // Get the product
    const productResult = await ddb.send(
      new GetCommand({
        TableName: process.env.PRODUCTS_TABLE,
        Key: { productId: req.params.id },
      })
    );

    if (!productResult.Item) {
      return res.status(404).json({ message: "Product not found" });
    }

    const product = productResult.Item;

    // Get store/seller details if sellerId exists
    let storeDetails = null;
    if (product.ownerId) {
      try {
        const storeResult = await ddb.send(
  new GetCommand({
    TableName: process.env.USERS_TABLE,
    Key: {
      userId: product.ownerId,
      role: "admin",
    },
  })
);

        if (storeResult.Item) {
          // Only return public store information
          storeDetails = {
            sellerId: storeResult.Item.userId,
            sellerName: storeResult.Item.name,
            sellerEmail: storeResult.Item.email,
            sellerAvatar: storeResult.Item.avatar,
            storeName: storeResult.Item.storeName,
            storeDescription: storeResult.Item.storeDescription,
            storeAddress: storeResult.Item.storeAddress,
            storeCity: storeResult.Item.storeCity,
            storeState: storeResult.Item.storeState,
            storeZipCode: storeResult.Item.storeZipCode,
            storeCountry: storeResult.Item.storeCountry,
          };
        }
      } catch (storeErr) {
        console.error("Error fetching store details:", storeErr);
        // Continue without store details rather than failing the whole request
      }
    }

    return res.json({
      ...product,
      store: storeDetails,
    });
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

    // Fetch existing product
    const result = await ddb.send(
      new GetCommand({
        TableName: TABLE,
        Key: { productId },
      })
    );

    if (!result.Item) {
      return res.status(404).json({ message: "Product not found" });
    }

    const product = result.Item;

    // Authorization
    const isAdmin = req.user?.["custom:role"] === "admin";
    const isOwner = req.user?.sub === product.ownerId;

    if (!isAdmin || !isOwner) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const fields = req.body;

    const updates = [];
    const values = {};
    const names = {};

    const updatableFields = [
      "title",
      "imageUrl",
      "description",
      "category",
      "brand",
      "metadata",
    ];

    for (const key of updatableFields) {
      if (fields[key] !== undefined) {
        names[`#${key}`] = key;
        values[`:${key}`] = fields[key];
        updates.push(`#${key} = :${key}`);
      }
    }

    if (fields.price !== undefined) {
      const price = Number(fields.price);
      if (isNaN(price) || price < 0) {
        return res.status(400).json({ message: "Invalid price" });
      }
      names["#price"] = "price";
      values[":price"] = price;
      updates.push("#price = :price");
    }

    if (fields.stock !== undefined) {
      const stock = Number(fields.stock);
      if (!Number.isInteger(stock) || stock < 0) {
        return res.status(400).json({ message: "Invalid stock" });
      }
      names["#stock"] = "stock";
      values[":stock"] = stock;
      updates.push("#stock = :stock");
    }

    // Prevent empty update
    if (updates.length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    // Timestamp
    names["#updatedAt"] = "updatedAt";
    values[":updatedAt"] = new Date().toISOString();
    updates.push("#updatedAt = :updatedAt");

    const updateResult = await ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { productId },
        UpdateExpression: "SET " + updates.join(", "),
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: "ALL_NEW",
      })
    );

    return res.json({
      message: "Product updated successfully",
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

    // Fetch product
    const result = await ddb.send(
      new GetCommand({
        TableName: TABLE,
        Key: { productId },
      })
    );

    if (!result.Item) {
      return res.status(404).json({ message: "Product not found" });
    }

    const product = result.Item;

    // Authorization check
    const isAdmin = req.user?.["custom:role"] === "admin";
    const isOwner = req.user?.sub === product.ownerId;

    if (!isAdmin || !isOwner) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Delete product
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


export const searchProducts = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim() === "") {
      return res.status(400).json({ message: "Search query is required" });
    }

    const keyword = q.toLowerCase();

    const params = {
      TableName: TABLE,
      FilterExpression: `
        contains(#title, :q) OR
        contains(#description, :q) OR
        contains(#category, :q) OR
        contains(#brand, :q)
      `,
      ExpressionAttributeNames: {
        "#title": "title",
        "#description": "description",
        "#category": "category",
        "#brand": "brand",
      },
      ExpressionAttributeValues: {
        ":q": keyword,
      },
    };

    const result = await ddb.send(new ScanCommand(params));

    res.status(200).json({
      count: result.Items.length,
      products: result.Items,
    });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ message: "Error searching products" });
  }
};
