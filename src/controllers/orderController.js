import {
  PutCommand,
  ScanCommand,
  DeleteCommand,
  UpdateCommand,
  QueryCommand,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
import ddb from "../dynamo.js";
import { v4 as uuidv4 } from "uuid";
export const placeOrder = async (req, res) => {
  try {
    const userId = req.user.userId;
    const timestamp = new Date().toISOString();

    // 1️⃣ Get user's cart
    const cartResult = await ddb.send(
      new QueryCommand({
        TableName: process.env.CART_TABLE || "Cart",
        KeyConditionExpression: "userId = :u",
        ExpressionAttributeValues: { ":u": userId },
      })
    );

    const cartItems = cartResult.Items;

    if (!cartItems || cartItems.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    // 2️⃣ Update stock for each product
    for (const item of cartItems) {
      try {
        await ddb.send(
          new UpdateCommand({
            TableName: process.env.PRODUCTS_TABLE || "Products",
            Key: { productId: item.productId },
            UpdateExpression: "SET stock = stock - :q",
            ConditionExpression: "stock >= :q",
            ExpressionAttributeValues: { ":q": item.quantity },
            ReturnValues: "UPDATED_NEW",
          })
        );
      } catch (err) {
        if (err.name === "ConditionalCheckFailedException") {
          return res.status(400).json({
            message: `Insufficient stock for product ${item.productId}`,
          });
        }
        throw err;
      }
    }

    // 3️⃣ Create order
    const orderId = uuidv4();
    const newOrder = {
      orderId,
      userId,
      items: cartItems.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
      })),
      status: "PENDING",
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await ddb.send(
      new PutCommand({
        TableName: process.env.ORDER_TABLE || "Orders",
        Item: newOrder,
      })
    );

    // 4️⃣ Clear the cart
    for (const item of cartItems) {
      await ddb.send(
        new DeleteCommand({
          TableName: process.env.CART_TABLE || "Cart",
          Key: { userId, productId: item.productId },
        })
      );
    }

    return res.status(201).json({
      message: "Order placed successfully",
      order: newOrder,
    });
  } catch (err) {
    console.error("Place order error:", err);
    return res.status(500).json({ message: err.message || "Error placing order" });
  }
};


// --------------------- GET USER ORDERS ---------------------
export const getUserOrders = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await ddb.send(
      new ScanCommand({
        TableName: process.env.ORDER_TABLE || "Orders",
        FilterExpression: "userId = :u",
        ExpressionAttributeValues: { ":u": userId },
      })
    );

    res.status(200).json({
      message: "Orders fetched successfully",
      orders: result.Items || [],
    });
  } catch (err) {
    console.error("Get orders error:", err);
    res.status(500).json({ message: "Error fetching orders", error: err.message });
  }
};


export const deleteOrder = async (req, res) => {
  try {
    const userId = req.user.userId; // get user from token
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({ message: "orderId is required" });
    }

    // Check if order exists
    const existingOrder = await ddb.send(
      new GetCommand({
        TableName: process.env.ORDER_TABLE || "Orders",
        Key: { orderId },
      })
    );

    if (!existingOrder.Item) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Only allow deletion if the order belongs to this user
    if (existingOrder.Item.userId !== userId) {
      return res.status(403).json({ message: "Not authorized to delete this order" });
    }

    // Delete the order
    await ddb.send(
      new DeleteCommand({
        TableName: process.env.ORDER_TABLE || "Orders",
        Key: { orderId },
      })
    );

    res.status(200).json({ message: "Order deleted successfully" });
  } catch (err) {
    console.error("Delete order error:", err);
    res.status(500).json({ message: "Error deleting order", error: err.message });
  }
};