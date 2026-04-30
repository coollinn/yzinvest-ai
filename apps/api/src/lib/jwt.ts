import { jwtVerify, SignJWT } from "jose";
import type { AuthUser } from "../types";

const ACCESS_EXPIRES = "15m";
const REFRESH_EXPIRES = "7d";

interface AccessTokenPayload {
  sub: string; // user id
  username: string;
  role: "user" | "admin";
}

interface RefreshTokenPayload {
  sub: string;
  type: "refresh";
}

function getSecret(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(
  user: AuthUser,
  secret: string
): Promise<string> {
  return new SignJWT({
    username: user.username,
    role: user.role,
  } as Omit<AccessTokenPayload, "sub">)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(ACCESS_EXPIRES)
    .sign(getSecret(secret));
}

export async function signRefreshToken(
  userId: number,
  secret: string
): Promise<string> {
  return new SignJWT({ type: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(REFRESH_EXPIRES)
    .sign(getSecret(secret));
}

export async function verifyAccessToken(
  token: string,
  secret: string
): Promise<AuthUser> {
  const { payload } = await jwtVerify<AccessTokenPayload>(
    token,
    getSecret(secret)
  );
  if (!payload.sub) throw new Error("invalid token: missing sub");
  return {
    id: Number(payload.sub),
    username: payload.username,
    role: payload.role,
  };
}

export async function verifyRefreshToken(
  token: string,
  secret: string
): Promise<number> {
  const { payload } = await jwtVerify<RefreshTokenPayload>(
    token,
    getSecret(secret)
  );
  if (payload.type !== "refresh") throw new Error("not a refresh token");
  if (!payload.sub) throw new Error("invalid token: missing sub");
  return Number(payload.sub);
}

export function getExpiresAt(): string {
  // access token 过期时间（前端用来判断刷新时机）
  return new Date(Date.now() + 15 * 60 * 1000).toISOString();
}
