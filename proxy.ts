import {
  NextResponse,
  type NextRequest,
} from "next/server";

import {
  SESSION_COOKIE_NAME,
} from "@/modules/auth/server/session.constants";

const publicPaths = new Set([
  "/login",
]);

function isPublicPath(
  pathname: string,
): boolean {
  if (publicPaths.has(pathname)) {
    return true;
  }

  return (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/robots.txt") ||
    pathname.startsWith("/sitemap.xml")
  );
}

export function proxy(
  request: NextRequest,
) {
  const { pathname, search } =
    request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const sessionToken =
    request.cookies.get(
      SESSION_COOKIE_NAME,
    )?.value;

  if (sessionToken) {
    return NextResponse.next();
  }

  const loginUrl =
    new URL("/login", request.url);

  const nextPath =
    `${pathname}${search}`;

  loginUrl.searchParams.set(
    "next",
    nextPath,
  );

  return NextResponse.redirect(
    loginUrl,
  );
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
