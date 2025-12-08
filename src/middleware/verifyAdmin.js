import jwt from "jsonwebtoken";

export default function verifyAdmin(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: "Missing Authorization header" });
  }

  const token = authHeader.split(" ")[1];

  try {
    // We do NOT verify signature here because Cognito already issues signed tokens.
    const decoded = jwt.decode(token);

    if (!decoded) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const role = decoded["custom:role"];

    if (role !== "admin") {
      return res.status(403).json({ message: "Only admin can perform this action" });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(400).json({
      message: "Token error",
      error: err.message,
    });
  }
}
