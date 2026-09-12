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
    // Try EVERY credential the caller presented, not just the first one found.
    // The cookie used to win outright (`cookie ?? body`), which quietly broke
    // mobile: React Native keeps a native cookie jar, so the app carries a
    // `travel_refreshToken` cookie from an earlier login or trusted session
    // alongside the token it sends in the body. Once those two diverged, a stale
    // cookie 401'd a request whose body token was perfectly valid — and the
    // client turns a 401 here into a logout, dropping the user to the login
    // screen mid-session. Deduped so the common case (both the same) is one query.
    const candidates = [...new Set([request.cookies[COOKIE_NAME], body?.refreshToken])].filter(
      (t): t is string => typeof t === "string" && t.length > 0,
    );
    if (candidates.length === 0) return reply.code(401).send({ error: "no refresh token" });

    let accepted: string | null = null;
    let valid: { userId: number } | null = null;
    for (const candidate of candidates) {
      valid = await validateRefreshToken(candidate);
      if (valid) {
        accepted = candidate;
        break;
      }
    }
    if (!valid || !accepted) {
      return reply.code(401).send({ error: "invalid or expired refresh token" });
    }

    const user = await findUserById(valid.userId);
    if (!user) return reply.code(401).send({ error: "user not found" });

    // Heal the divergence: if a cookie was sent but the body's token is the one
    // that validated, overwrite the cookie so the two converge instead of
    // failing this way again on every refresh.
    if (accepted !== request.cookies[COOKIE_NAME]) {
      // Logged deliberately: this line firing is the proof that cookie/body
      // divergence is what was spuriously logging mobile out. If it never
      // appears, the cause was something else.
      request.log.warn(
        { hadCookie: request.cookies[COOKIE_NAME] != null },
        "refresh: cookie token rejected, body token accepted — reconverging cookie",
      );
      setRefreshCookie(reply, accepted);
    }

    return { accessToken: createAccessToken(user.id) };
  });

  app.post("/logout", async (request, reply) => {
    const token = request.cookies[COOKIE_NAME];
    if (token) await deleteRefreshToken(token);
    reply.clearCookie(COOKIE_NAME, { path: "/" });
    return reply.code(204).send();
  });
}
