import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  // 公开 Host 会被内部 rewrite 到该路由；rewrite 的第二次中间件执行
  // 可能已使用 NEXTAUTH_URL 的主站 Host，因此路径本身也必须显式放行。
  if (req.nextUrl.pathname.startsWith("/published/")) {
    return NextResponse.next();
  }

  const publishedRoot =
    process.env.PUBLISHED_APPS_DOMAIN || "apps.xiongerer.xyz";
  // Auth.js 会依据 NEXTAUTH_URL 归一化 nextUrl；反向代理下必须使用原始
  // Host/X-Forwarded-Host 才能识别公开应用子域名。
  const forwardedHost = req.headers.get("x-forwarded-host");
  const hostHeader = forwardedHost || req.headers.get("host") || "";
  const hostname = hostHeader.split(",")[0].trim().split(":")[0].toLowerCase();
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
