import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/session";

const PUBLIC_ROUTES = ["/login"];
const PUBLIC_API_PREFIXES = ["/api/auth/"];

function getCdnBase(): string | null {
  const bucket = process.env.DO_SPACES_BUCKET;
  const region = process.env.DO_SPACES_REGION;
  const prefix = process.env.DO_SPACES_PREFIX ?? "manhwa-studio";
  if (!bucket || !region) return null;
  return `https://${bucket}.${region}.digitaloceanspaces.com/${prefix}`;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Redirect /generated/* to DO Spaces CDN at request time
  if (pathname.startsWith("/generated/")) {
    const cdnBase = getCdnBase();
    if (cdnBase) {
      return NextResponse.redirect(`${cdnBase}${pathname}`, { status: 307 });
    }
  }

  // Allow public routes
  if (PUBLIC_ROUTES.includes(pathname)) return NextResponse.next();
  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const token = request.cookies.get("session")?.value;
  const session = token ? await verifyToken(token) : null;

  // Unauthenticated
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin routes require SUPERADMIN
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin/users")) {
    if (session.role !== "SUPERADMIN") {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/projects", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|favicon.svg|public/).*)",
  ],
};
