import { PutCommand, GetCommand, DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import ddb from "../dynamo.js";

// --------------------- ADD OR UPDATE ITEMS IN CART ---------------------
export const addToCart = async (req, res) => {
  try {
    const { items } = req.body; // [{ productId, quantity }]
    const userId = req.user.userId;

    if (!items || !items.length) {
      return res.status(400).json({ message: "Items array is required" });
    }

    const timestamp = new Date().toISOString();

    // Loop through each product and add/update in cart
    for (const item of items) {
      if (!item.productId || !item.quantity || item.quantity <= 0) {
        continue; // skip invalid items
      }

      // PutCommand will create or overwrite the cart item
      await ddb.send(
        new PutCommand({
          TableName: process.env.CART_TABLE || "Cart",
          Item: {
            userId,
            productId: item.productId,
            quantity: item.quantity,
            addedAt: timestamp,
            updatedAt: timestamp,
          },
        })
      );
    }

    res.status(200).json({ message: "Cart updated successfully" });
  } catch (err) {
    console.error("Add to cart error:", err);
    res.status(500).json({ message: "Error updating cart", error: err.message });
  }
};

// --------------------- GET USER CART ---------------------
export const getUserCart = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await ddb.send(
      new QueryCommand({
        TableName: process.env.CART_TABLE || "Cart",
        KeyConditionExpression: "userId = :u",
        ExpressionAttributeValues: { ":u": userId },
      })
    );

    res.status(200).json({
      message: "Cart fetched successfully",
      cart: result.Items || [],
    });
  } catch (err) {
    console.error("Get cart error:", err);
    res.status(500).json({ message: "Error fetching cart", error: err.message });
  }
};

// --------------------- UPDATE SPECIFIC PRODUCT QUANTITY ---------------------
export const updateCartItem = async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const userId = req.user.userId;

    if (!productId || quantity === undefined || quantity <= 0) {
      return res.status(400).json({ message: "Valid productId and quantity are required" });
    }

    // Check if item exists
    const existingItem = await ddb.send(
      new GetCommand({
        TableName: process.env.CART_TABLE || "Cart",
        Key: { userId, productId },
      })
    );

    if (!existingItem.Item) {
      return res.status(404).json({ message: "Product not found in cart" });
    }

    // Update quantity
    await ddb.send(
      new PutCommand({
        TableName: process.env.CART_TABLE || "Cart",
        Item: {
          userId,
          productId,
          quantity,
          updatedAt: new Date().toISOString(),
          addedAt: existingItem.Item.addedAt, // preserve original addedAt
        },
      })
    );

    res.status(200).json({ message: "Cart item updated successfully" });
  } catch (err) {
    console.error("Update cart item error:", err);
    res.status(500).json({ message: "Error updating cart item", error: err.message });
  }
};

// --------------------- REMOVE ITEM FROM CART ---------------------
export const deleteCartItem = async (req, res) => {
  try {
    const { productId } = req.body;
    const userId = req.user.userId;

    if (!productId) {
      return res.status(400).json({ message: "productId is required" });
    }

    // Check if item exists
    const existingItem = await ddb.send(
      new GetCommand({
        TableName: process.env.CART_TABLE || "Cart",
        Key: { userId, productId },
      })
    );

    if (!existingItem.Item) {
      return res.status(404).json({ message: "Product not found in cart" });
    }

    await ddb.send(
      new DeleteCommand({
        TableName: process.env.CART_TABLE || "Cart",
        Key: { userId, productId },
      })
    );

    res.status(200).json({ message: "Cart item removed successfully" });
  } catch (err) {
    console.error("Delete cart item error:", err);
    res.status(500).json({ message: "Error removing cart item", error: err.message });
  }
};
