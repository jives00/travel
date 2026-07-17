import { z } from "zod";

export const LoginBody = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});
export type LoginBody = z.infer<typeof LoginBody>;

export interface LoginResponse {
  accessToken: string;
  // Also returned in the body (not just set as an httpOnly cookie) for mobile
  // clients, which have no cookie jar and must persist it themselves.
  refreshToken: string;
}

// POST /api/auth/session takes no body — trusted-network auto-login.
export const RefreshBody = z.object({
  refreshToken: z.string().min(1).optional(),
});
export type RefreshBody = z.infer<typeof RefreshBody>;

export interface RefreshResponse {
  accessToken: string;
}
