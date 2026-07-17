import type { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { LoginBody, type RefreshBody } from "@travel/types";
import { isTrustedRequest } from "../middleware/auth";
import {
  createAccessToken,
  createRefreshToken,
  deleteRefreshToken,
  findUserByUsername,
  findUserById,
  validateRefreshToken,
  verifyPassword,
} from "../services/auth.service";

const COOKIE_NAME = "travel_refreshToken";

function setRefreshCookie(reply: import("fastify").FastifyReply, token: string) {
  reply.setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && reply.request.headers["x-forwarded-proto"] === "https",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // global:false — rate limiting only applies to routes that opt in via
  // `config.rateLimit` below. Registering it globally (the original bug) meant
  // /session, /refresh, and /logout shared the same 10-req/15min budget as
  // /login — and /refresh fires on essentially every page load (the SSR-prefetch
  // pattern re-exchanges the cookie for a token per request), so normal use
  // exhausted it almost immediately, silently breaking every page after.
  await app.register(rateLimit, { global: false });

  app.post(
    "/login",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const parsed = LoginBody.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid body" });

      const user = await findUserByUsername(parsed.data.username);
      if (!user || !(await verifyPassword(user, parsed.data.password))) {
        return reply.code(401).send({ error: "invalid credentials" });
      }

      const accessToken = createAccessToken(user.id);
      const refreshToken = await createRefreshToken(user.id);
      setRefreshCookie(reply, refreshToken);
      return { accessToken, refreshToken };
    },
  );

  // Passwordless auto-login on the trusted home network — single-user app,
  // always resolves to the one ADMIN_USERNAME account.
  app.post("/session", async (request, reply) => {
    if (!isTrustedRequest(request)) {
      return reply.code(401).send({ error: "untrusted network" });
    }
    const user = await findUserByUsername(process.env.ADMIN_USERNAME ?? "");
    if (!user) return reply.code(500).send({ error: "admin user missing" });

    const accessToken = createAccessToken(user.id);
    const refreshToken = await createRefreshToken(user.id);
    setRefreshCookie(reply, refreshToken);
    return { accessToken, refreshToken };
  });

  app.post("/refresh", async (request, reply) => {
    const body = request.body as RefreshBody | undefined;
    const token = request.cookies[COOKIE_NAME] ?? body?.refreshToken;
    if (!token) return reply.code(401).send({ error: "no refresh token" });

    const valid = await validateRefreshToken(token);
    if (!valid) return reply.code(401).send({ error: "invalid or expired refresh token" });

    const user = await findUserById(valid.userId);
    if (!user) return reply.code(401).send({ error: "user not found" });

    return { accessToken: createAccessToken(user.id) };
  });

  app.post("/logout", async (request, reply) => {
    const token = request.cookies[COOKIE_NAME];
    if (token) await deleteRefreshToken(token);
    reply.clearCookie(COOKIE_NAME, { path: "/" });
    return reply.code(204).send();
  });
}
