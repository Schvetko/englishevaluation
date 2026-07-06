import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, adminCookieValue } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const expected = process.env.ADMIN_PASSWORD;

  if (!expected) {
    return NextResponse.redirect(
      new URL("/admin?error=unconfigured", request.url),
      303,
    );
  }

  if (password !== expected) {
    return NextResponse.redirect(new URL("/admin?error=1", request.url), 303);
  }

  const response = NextResponse.redirect(new URL("/admin", request.url), 303);
  response.cookies.set(ADMIN_COOKIE, adminCookieValue()!, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 12,
    path: "/",
  });
  return response;
}
