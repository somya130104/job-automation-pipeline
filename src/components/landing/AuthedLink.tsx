"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
} from "@clerk/nextjs";

const clerkOn = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

/**
 * Landing-page CTA. With Clerk off (local single-profile mode) it's just a
 * link. With Clerk on it opens the sign-in / sign-up modal for signed-out
 * visitors and links straight through once they're authenticated — so
 * "Get started" never dead-ends by bouncing off a protected route.
 */
export function AuthedLink({
  href,
  className,
  mode = "signin",
  children,
}: {
  href: string;
  className?: string;
  mode?: "signin" | "signup";
  children: ReactNode;
}) {
  if (!clerkOn) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }

  const Button = mode === "signup" ? SignUpButton : SignInButton;

  return (
    <>
      <SignedIn>
        <Link href={href} className={className}>
          {children}
        </Link>
      </SignedIn>
      <SignedOut>
        <Button mode="modal" forceRedirectUrl={href}>
          <button type="button" className={className}>
            {children}
          </button>
        </Button>
      </SignedOut>
    </>
  );
}
