import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { clerkEnabled } from "@/lib/auth";

/**
 * Wraps the app in <ClerkProvider> only when real Clerk keys are present, so
 * the app still boots against a single local profile when they're blank.
 *
 * Why a dedicated module with a top-level `import` (not a lazy `require` in
 * layout.tsx): `require("@clerk/nextjs")` resolves to Clerk's CJS build while
 * the <SignIn>/<UserButton> components resolve to the ESM build. Two module
 * graphs means two React contexts, and the UI components throw
 * "useSession can only be used within <ClerkProvider>". A static import keeps
 * everything on one graph. Importing the module does not validate keys —
 * only *rendering* <ClerkProvider> without a key throws, which the guard below
 * prevents.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  if (!clerkEnabled()) return <>{children}</>;
  return <ClerkProvider>{children}</ClerkProvider>;
}
