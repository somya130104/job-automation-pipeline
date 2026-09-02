"use client";

import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs";

/**
 * Auth controls for the nav. Rendered only when real Clerk keys are present —
 * NEXT_PUBLIC_* is inlined client-side at build, so this stays in sync with
 * the conditional <ClerkProvider> in layout.tsx and the app still runs with a
 * single local profile when the keys are blank.
 */
const clerkOn = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export function NavAuth() {
  if (!clerkOn) return null;

  return (
    <>
      <SignedOut>
        <SignInButton mode="modal">
          <button className="shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold text-paper/70 transition-colors hover:bg-white/5 hover:text-paper">
            Sign in
          </button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button className="shrink-0 rounded-full border-2 border-ink bg-accent px-3 py-1.5 text-sm font-semibold text-ink shadow-hard transition-transform hover:-translate-y-0.5">
            Sign up
          </button>
        </SignUpButton>
      </SignedOut>
      <SignedIn>
        <UserButton
          afterSignOutUrl="/"
          appearance={{ elements: { avatarBox: "h-8 w-8" } }}
        />
      </SignedIn>
    </>
  );
}
