import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const publishedRoot =
    process.env.PUBLISHED_APPS_DOMAIN || "apps.xiongerer.xyz";
  const hostname = req.nextUrl.hostname.toLowerCase();
  if (hostname.endsWith(`.${publishedRoot}`)) {
    const slug = hostname.slice(0, -(publishedRoot.length + 1));
    if (/^[a-z0-9-]+$/.test(slug)) {
      const pathname =
        req.nextUrl.pathname === "/" ? "/index.html" : req.nextUrl.pathname;
      return NextResponse.rewrite(
        new URL(`/published/${slug}${pathname}${req.nextUrl.search}`, req.url),
      );
    }
    return new NextResponse("Not found", { status: 404 });
  }

  const isLoggedIn = !!req.auth;
  const isLoginPage = req.nextUrl.pathname === "/login";

  // 未登录且不在登录页，重定向到登录页
  if (!isLoggedIn && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // 已登录但在登录页，重定向到首页
  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
