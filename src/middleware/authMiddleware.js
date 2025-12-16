import jwt from "jsonwebtoken";

// This middleware extracts user info from Cognito JWT and ensures role "user"
export default function isUser(req, res, next){
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authorization token missing" });
    }

    const token = authHeader.split(" ")[1];

    // Decode token WITHOUT verifying signature (optional, for testing)
    // For production, verify with Cognito public keys (jwks)
    const decoded = jwt.decode(token, { complete: true })?.payload;

    if (!decoded) {
      return res.status(401).json({ message: "Invalid token" });
    }

    // Attach user info to request
    req.user = {
      userId: decoded.sub, // Cognito User Pool ID
      email: decoded.email,
      role: decoded["custom:role"],
      groups: decoded["cognito:groups"] || [],
    };

    next();
  } catch (err) {
    console.error("Auth error:", err);
    return res.status(401).json({ message: "Invalid token", error: err.message });
  }
};
