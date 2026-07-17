import type { FastifyReply, FastifyRequest } from "fastify";
import { isTrustedClient } from "../utils/trustedNetwork";

export function isTrustedRequest(request: FastifyRequest): boolean {
  // request.socket.remoteAddress, not request.ip — avoids X-Forwarded-For spoofing
  const extraCidrs = (process.env.TRUSTED_CIDRS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return isTrustedClient(
    request.headers as Record<string, string | string[] | undefined>,
    request.socket.remoteAddress,
    extraCidrs,
  );
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    reply.code(401).send({ error: "unauthorized" });
  }
}
