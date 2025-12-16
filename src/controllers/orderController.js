import {
  PutCommand,
  ScanCommand,
  DeleteCommand,
  UpdateCommand,
  QueryCommand,
  GetCommand,
  BatchGetCommand,
} from "@aws-sdk/lib-dynamodb";
import ddb from "../dynamo.js";
import { v4 as uuidv4 } from "uuid";
import { publishEvent } from "../services/snsPublisher.js";



export const placeOrder = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userEmail = req.user.email; 
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

    // 2️⃣ Update stock and fetch product details
    const orderItems = [];
    for (const item of cartItems) {
      // Fetch product details
      const productResult = await ddb.send(
        new GetCommand({
          TableName: process.env.PRODUCTS_TABLE || "Products",
          Key: { productId: item.productId },
        })
      );

      const product = productResult.Item;

      if (!product) {
        return res.status(404).json({ message: `Product ${item.productId} not found` });
      }

      // Update stock
      try {
        await ddb.send(
          new UpdateCommand({
            TableName: process.env.PRODUCTS_TABLE || "Products",
            Key: { productId: item.productId },
            UpdateExpression: "SET stock = stock - :q",
            ConditionExpression: "stock >= :q",
            ExpressionAttributeValues: { ":q": item.quantity },
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

      // Save product details in order
      orderItems.push({
        productId: item.productId,
        quantity: item.quantity,
        product, // full product details
      });
    }

    // 3️⃣ Create order
    const orderId = uuidv4();
    const newOrder = {
      orderId,
      userId,
      items: orderItems, // includes full product info
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

    // 4️⃣ Clear cart
    for (const item of cartItems) {
      await ddb.send(
        new DeleteCommand({
          TableName: process.env.CART_TABLE || "Cart",
          Key: { userId, productId: item.productId },
        })
      );
    }

    // 5️⃣ Publish ORDER event
    await publishEvent({
  toEmail: userEmail,
  subject: "Order Placed Successfully",
  body: `Your order ${orderId} was placed on ${timestamp}.
Items: ${newOrder.items.map(i => i.name).join(", ")}`
});


    return res.status(201).json({
      message: "Order placed successfully",
      order: newOrder,
    });
  } catch (err) {
    console.error("Place order error:", err);
    return res.status(500).json({
      message: err.message || "Error placing order",
    });
  }
};
// --------------------- GET USER ORDERS WITH PRODUCT DETAILS ---------------------
export const getUserOrders = async (req, res) => {
  try {
    const userId = req.user.userId;

    // 1️⃣ Get all orders for the user
    const ordersResult = await ddb.send(
      new ScanCommand({
        TableName: process.env.ORDER_TABLE || "Orders",
        FilterExpression: "userId = :u",
        ExpressionAttributeValues: { ":u": userId },
      })
    );

    const orders = ordersResult.Items || [];

    if (orders.length === 0) {
      return res.status(200).json({ message: "Orders fetched successfully", orders: [] });
    }

    // 2️⃣ Collect all unique productIds across all orders
    const productIds = [
      ...new Set(orders.flatMap((order) => order.items.map((item) => item.productId))),
    ];

    // 3️⃣ Fetch all product details in one batch
    const productsResult = await ddb.send(
      new BatchGetCommand({
        RequestItems: {
          [process.env.PRODUCTS_TABLE || "Products"]: {
            Keys: productIds.map((id) => ({ productId: id })),
          },
        },
      })
    );

    const products = productsResult.Responses?.[process.env.PRODUCTS_TABLE || "Products"] || [];

    // 4️⃣ Attach product details to each order item
    const ordersWithDetails = orders.map((order) => {
      const itemsWithDetails = order.items.map((item) => {
        const product = products.find((p) => p.productId === item.productId);
        return { ...item, product: product || null };
      });
      return { ...order, items: itemsWithDetails };
    });

    res.status(200).json({
      message: "Orders fetched successfully",
      orders: ordersWithDetails,
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


export const getOrdersForMyStore = async (req, res) => {
  try {
    if (!req.user || !req.user.sub) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const ownerId = req.user.sub; // admin/store manager ID

    // 1️⃣ Fetch all orders
    const ordersResult = await ddb.send(
      new ScanCommand({
        TableName: process.env.ORDER_TABLE || "Orders",
      })
    );

    const orders = ordersResult.Items || [];

    if (orders.length === 0) {
      return res.status(200).json([]);
    }

    // 2️⃣ Collect unique productIds from all orders
    const productIds = [
      ...new Set(
        orders.flatMap((order) =>
          order.items.map((item) => item.productId)
        )
      ),
    ];

    // 3️⃣ Fetch product ownership
    const productsResult = await ddb.send(
      new BatchGetCommand({
        RequestItems: {
          [process.env.PRODUCTS_TABLE || "Products"]: {
            Keys: productIds.map((id) => ({ productId: id })),
            ProjectionExpression: "productId, ownerId",
          },
        },
      })
    );

    const products =
      productsResult.Responses?.[
        process.env.PRODUCTS_TABLE || "Products"
      ] || [];

    const ownerProductMap = {};
    products.forEach((p) => {
      ownerProductMap[p.productId] = p.ownerId;
    });

    // 4️⃣ Filter orders that belong to this admin
    const filteredOrders = orders
      .map((order) => {
        const adminItems = order.items.filter(
          (item) => ownerProductMap[item.productId] === ownerId
        );

        if (adminItems.length === 0) return null;

        return {
          ...order,
          items: adminItems, // only admin's products
        };
      })
      .filter(Boolean);

    return res.status(200).json(filteredOrders);
  } catch (err) {
    console.error("Admin store orders error:", err);
    return res.status(500).json({
      message: "Unable to fetch store orders",
      error: err.message,
    });
  }
};

export const updateOrderStatus = async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;

  const allowed = ["PENDING", "SHIPPED", "DELIVERED"];
  if (!allowed.includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  await ddb.send(
    new UpdateCommand({
      TableName: process.env.ORDER_TABLE || "Orders",
      Key: { orderId },
      UpdateExpression: "SET #s = :s, updatedAt = :u",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":s": status,
        ":u": new Date().toISOString(),
      },
    })
  );

  res.json({ message: "Order status updated" });
};


export const getStoreDashboardStats = async (req, res) => {
  try {
    if (!req.user || !req.user.sub) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const ownerId = req.user.sub;

    // 1️⃣ Get all orders
    const ordersResult = await ddb.send(
      new ScanCommand({
        TableName: process.env.ORDER_TABLE || "Orders",
      })
    );

    const orders = ordersResult.Items || [];
    if (orders.length === 0) {
      return res.status(200).json({
        totals: {},
        ordersByStatus: {},
        revenueByDay: [],
        topProducts: [],
      });
    }

    // 2️⃣ Collect productIds
    const productIds = [
      ...new Set(
        orders.flatMap((o) => o.items.map((i) => i.productId))
      ),
    ];

    // 3️⃣ Fetch product ownership
    const productsResult = await ddb.send(
      new BatchGetCommand({
        RequestItems: {
          [process.env.PRODUCTS_TABLE || "Products"]: {
            Keys: productIds.map((id) => ({ productId: id })),
            ProjectionExpression: "productId, ownerId, title",
          },
        },
      })
    );

    const products =
      productsResult.Responses?.[
        process.env.PRODUCTS_TABLE || "Products"
      ] || [];

    const productMap = {};
    products.forEach((p) => {
      productMap[p.productId] = p;
    });

    // 📊 AGGREGATIONS
    let totalRevenue = 0;
    let totalOrders = 0;
    let totalItemsSold = 0;

    const ordersByStatus = {
      PENDING: 0,
      SHIPPED: 0,
      DELIVERED: 0,
    };

    const revenueByDay = {};
    const productStats = {};

    // 4️⃣ Process orders
    for (const order of orders) {
      const adminItems = order.items.filter(
        (i) => productMap[i.productId]?.ownerId === ownerId
      );

      if (adminItems.length === 0) continue;

      totalOrders++;
      ordersByStatus[order.status]++;

      const orderDate = order.createdAt.split("T")[0];
      if (!revenueByDay[orderDate]) {
        revenueByDay[orderDate] = 0;
      }

      for (const item of adminItems) {
        const price = item.product.price;
        const revenue = price * item.quantity;

        totalRevenue += revenue;
        totalItemsSold += item.quantity;
        revenueByDay[orderDate] += revenue;

        if (!productStats[item.productId]) {
          productStats[item.productId] = {
            productId: item.productId,
            title: item.product.title,
            quantitySold: 0,
            revenue: 0,
          };
        }

        productStats[item.productId].quantitySold += item.quantity;
        productStats[item.productId].revenue += revenue;
      }
    }

    // 5️⃣ Prepare final response
    return res.status(200).json({
      totals: {
        totalOrders,
        totalRevenue,
        totalItemsSold,
      },
      ordersByStatus,
      revenueByDay: Object.entries(revenueByDay).map(
        ([date, revenue]) => ({ date, revenue })
      ),
      topProducts: Object.values(productStats).sort(
        (a, b) => b.revenue - a.revenue
      ),
    });
  } catch (err) {
    console.error("Dashboard stats error:", err);
    return res.status(500).json({
      message: "Unable to fetch dashboard stats",
      error: err.message,
    });
  }
};