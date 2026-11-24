import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  LOCAL_SESSION_COOKIE,
  verifySignedSessionToken,
} from "@/lib/auth/session-token";

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const pathname = request.nextUrl.pathname;
  const isProtectedStaffPath =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/doctor") ||
    pathname.startsWith("/super-admin");

  if (!url || !anonKey) {
    const usesPgAdapter =
      Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL) ||
      process.env.MEDCLINIC_LOCAL_PG === "true";
    if (usesPgAdapter && isProtectedStaffPath) {
      const localCookie = request.cookies.get(LOCAL_SESSION_COOKIE)?.value;
      const validUserId = verifySignedSessionToken(localCookie);
      if (!validUserId) {
        const loginUrl = new URL("/staff/login", request.url);
        loginUrl.searchParams.set("next", pathname);
        const redirectRes = NextResponse.redirect(loginUrl);
        if (localCookie) {
          redirectRes.cookies.delete(LOCAL_SESSION_COOKIE);
        }
        return redirectRes;
      }
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isProtectedStaffPath && !user) {
    const loginUrl = new URL("/staff/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/doctor/:path*",
    "/super-admin/:path*",
    "/staff/login",
  ],
};
