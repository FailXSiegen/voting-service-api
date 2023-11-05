import * as jwt from "jsonwebtoken";

export default async function (req, res, next) {
  if (process.env.ENABLE_JWT !== "1") {
    return next();
  }
  if (req.url !== process.env.GRAPHQL_ENDPOINT) {
    return next();
  }

  try {
    const authHeader = req.headers.authorization;
    const token = authHeader.split(" ")[1] || "";
    await jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json();
  }
}
