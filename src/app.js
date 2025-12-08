import dotenv from 'dotenv';
import 'dotenv/config';

dotenv.config(); // Load environment variables

import express from 'express';
import bodyParser from 'body-parser';

// Routes
import authRoutes from './routes/authRoutes.js';
import productRoutes from './routes/productRoutes.js';
import cartRoutes from "./routes/cartRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";



const app = express();

// Middleware
app.use(bodyParser.json());

// Routes
app.use('/auth', authRoutes);      // Register, Confirm, Login
app.use('/products', productRoutes); // Product CRUD
app.use("/cart", cartRoutes);
app.use("/order", orderRoutes);

// Server Start
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
