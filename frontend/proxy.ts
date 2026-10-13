import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Next 16 proxy (formerly middleware.ts). Runs Clerk session detection on all routes
// without locking anything down.
// Individual routes can call auth().protect() to require sign-in.
// Without Clerk keys (local dev, e2e) requests pass straight through.
export default process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  ? clerkMiddleware()
  : () => NextResponse.next();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jte?|ttf|woff2?|png|jpg|jpeg|gif|webp|svg|ico|avif|webm|mp4|xml|json)).*)",
    "/(api|trpc)(.*)",
  ],
};
