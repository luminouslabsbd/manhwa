/**
 * Edge-safe session helpers — only uses `jose` (no bcrypt/Node-only deps).
 * Used by proxy.ts which may run in Edge Runtime.
 */
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET ?? "dev-secret-change-in-production-32chars!!"
);

export type SessionPayload = {
  userId: string;
  email: string;
  name: string;
  role: "SUPERADMIN" | "USER";
};

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
