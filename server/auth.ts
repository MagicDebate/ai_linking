import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";

const JWT_SECRET = process.env.JWT_SECRET || "dev-jwt-secret-key-12345-very-long-and-secure-for-development";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "dev-refresh-secret-key-67890-also-very-long-and-secure-for-development";
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "30d";

export interface AuthRequest extends Request {
  user?: { id: string; email: string };
}

export function generateTokens(userId: string, email: string) {
  const accessToken = jwt.sign({ userId, email }, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });
  
  const refreshToken = jwt.sign({ userId, email }, JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRY,
  });

  return { accessToken, refreshToken };
}

export function verifyAccessToken(token: string) {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
  } catch (error) {
    return null;
  }
}

export function verifyRefreshToken(token: string) {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET) as { userId: string; email: string };
  } catch (error) {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function setTokenCookies(res: Response, accessToken: string, refreshToken: string) {
  const isProduction = process.env.NODE_ENV === "production";
  
  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: 15 * 60 * 1000, // 15 minutes
  });

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
}

export function clearTokenCookies(res: Response) {
  res.clearCookie("accessToken");
  res.clearCookie("refreshToken");
}

export async function authenticateToken(req: any, res: Response, next: NextFunction) {
  const accessToken = req.cookies?.accessToken;
  const refreshToken = req.cookies?.refreshToken;

  if (!accessToken && !refreshToken) {
    return res.status(401).json({ message: "No tokens provided" });
  }

  // Try to verify access token first
  if (accessToken) {
    const decoded = verifyAccessToken(accessToken);
    if (decoded) {
      const user = await storage.getUser(decoded.userId);
      if (user) {
        req.user = { id: user.id, email: user.email };
        return next();
      }
    }
  }

  // If access token is invalid/expired, try refresh token
  if (refreshToken) {
    const decoded = verifyRefreshToken(refreshToken);
    if (decoded) {
      const user = await storage.getUser(decoded.userId);
      if (user) {
        // Generate new tokens
        const { accessToken: newAccessToken, refreshToken: newRefreshToken } = 
          generateTokens(user.id, user.email);
        
        setTokenCookies(res, newAccessToken, newRefreshToken);
        req.user = { id: user.id, email: user.email };
        return next();
      }
    }
  }

  return res.status(401).json({ message: "Invalid or expired tokens" });
}
