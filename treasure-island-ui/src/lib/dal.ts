import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getSession, type SessionPayload } from "@/lib/auth";

export const verifySession = cache(async (): Promise<SessionPayload> => {
  const session = await getSession();
  if (!session?.userId) redirect("/login");
  return session;
});

export const verifyAdmin = cache(async (): Promise<SessionPayload> => {
  const session = await verifySession();
  if (session.role !== "SUPERADMIN") redirect("/projects");
  return session;
});

/** For API routes — returns null instead of redirecting */
export async function getSessionForApi(): Promise<SessionPayload | null> {
  return getSession();
}
