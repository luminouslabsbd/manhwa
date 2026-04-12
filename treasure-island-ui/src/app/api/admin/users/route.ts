import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { randomUUID } from "crypto";

export async function GET() {
  const users = await prisma.user.findMany({ orderBy: { created_at: "desc" } });
  // Strip passwords
  return Response.json(users.map(({ password: _p, ...u }) => u));
}

export async function POST(req: NextRequest) {
  const { name, email, password, role } = await req.json();

  if (!name?.trim() || !email?.trim() || !password) {
    return Response.json({ error: "name, email, password required" }, { status: 400 });
  }
  if (password.length < 8) {
    return Response.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (existing) return Response.json({ error: "Email already in use" }, { status: 409 });

  const hashed = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: email.toLowerCase().trim(),
      password: hashed,
      name: name.trim(),
      role: role === "SUPERADMIN" ? "SUPERADMIN" : "USER",
      is_active: true,
      created_at: new Date().toISOString(),
    },
  });

  const { password: _p, ...safeUser } = user;
  return Response.json(safeUser, { status: 201 });
}
