import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "frfuck_secret_2026";

type AuthUserPayload = {
  id: number;
  openId: string | null;
  name: string | null;
  email: string | null;
  role: string;
  lojaId: number | null;
  isActive: boolean;
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(
  password: string,
  passwordHash: string | null
): Promise<boolean> {
  if (!passwordHash) return false;
  return bcrypt.compare(password, passwordHash);
}

export function signAuthToken(user: AuthUserPayload): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyAuthToken(token: string): AuthUserPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthUserPayload;
  } catch {
    return null;
  }
}