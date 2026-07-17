import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { getPool } from "../db";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface User {
  id: number;
  username: string;
  passwordHash: string;
}

export async function findUserByUsername(username: string): Promise<User | null> {
  const [rows] = await getPool().query(
    "SELECT id, username, password_hash AS passwordHash FROM users WHERE username = ? LIMIT 1",
    [username],
  );
  const list = rows as User[];
  return list[0] ?? null;
}

export async function findUserById(id: number): Promise<User | null> {
  const [rows] = await getPool().query(
    "SELECT id, username, password_hash AS passwordHash FROM users WHERE id = ? LIMIT 1",
    [id],
  );
  const list = rows as User[];
  return list[0] ?? null;
}

export async function verifyPassword(user: User, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.passwordHash);
}

// @fastify/jwt is registered for verification only (request.jwtVerify()) — issuance
// goes through the plain `jsonwebtoken` package here. Two libraries, one for each job.
export function createAccessToken(userId: number): string {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET ?? "dev-secret-change-me", {
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

export async function createRefreshToken(userId: number): Promise<string> {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  await getPool().query(
    "INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)",
    [userId, token, expiresAt],
  );
  return token;
}

export async function validateRefreshToken(token: string): Promise<{ userId: number } | null> {
  const [rows] = await getPool().query(
    "SELECT user_id AS userId FROM refresh_tokens WHERE token = ? AND expires_at > NOW() LIMIT 1",
    [token],
  );
  const list = rows as { userId: number }[];
  return list[0] ?? null;
}

export async function deleteRefreshToken(token: string): Promise<void> {
  await getPool().query("DELETE FROM refresh_tokens WHERE token = ?", [token]);
}

/** Idempotently creates the single admin account on boot — this is a single-user app. */
export async function ensureAdminUser(): Promise<void> {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    throw new Error("ADMIN_USERNAME and ADMIN_PASSWORD must be set");
  }
  const existing = await findUserByUsername(username);
  if (existing) return;

  const passwordHash = await bcrypt.hash(password, 10);
  await getPool().query("INSERT INTO users (username, password_hash) VALUES (?, ?)", [
    username,
    passwordHash,
  ]);
}
