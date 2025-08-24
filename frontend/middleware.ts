import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/middleware";

export async function middleware(request: NextRequest) {
  const supabase = createClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protect /notebook and /dashboard routes
  const protectedRoutes = ["/notebook", "/dashboard"];
  const isProtected = protectedRoutes.some((route) => request.nextUrl.pathname.startsWith(route));
  if (isProtected && !user) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Redirect authenticated users away from auth pages
  const authRoutes = ["/auth/login", "/auth/signup", "/auth/reset"];
  const isAuthPage = authRoutes.some((route) => request.nextUrl.pathname.startsWith(route));
  if (isAuthPage && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/notebook/:path*", "/dashboard/:path*", "/auth/:path*"],
}; 