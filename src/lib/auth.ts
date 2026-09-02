import { db } from "@/lib/db";
import type { User } from "@prisma/client";

/**
 * Clerk is wired but optional. Until you drop real keys into .env the app runs
 * against a single local profile so nothing is gated behind a signup wall.
 * Add both keys and the exact same code paths start resolving real Clerk users.
 */
export function clerkEnabled(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
  );
}

export const LOCAL_AUTH_ID = "local-dev";

type Identity = { authId: string; email: string | null; name: string | null };

async function resolveIdentity(): Promise<Identity | null> {
  if (!clerkEnabled()) {
    return { authId: LOCAL_AUTH_ID, email: null, name: "Local Dev" };
  }

  // Imported lazily so the Clerk server runtime is never loaded (and never
  // throws about missing keys) when Clerk is switched off.
  const { currentUser } = await import("@clerk/nextjs/server");
  const user = await currentUser();
  if (!user) return null;

  return {
    authId: user.id,
    email: user.primaryEmailAddress?.emailAddress ?? null,
    name: [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
  };
}

/** Returns the app's User row, creating it on first sight. Null if signed out. */
export async function getCurrentUser(): Promise<User | null> {
  const identity = await resolveIdentity();
  if (!identity) return null;

  return db.user.upsert({
    where: { authId: identity.authId },
    update: {
      // Keep Clerk-owned fields in sync, but never clobber with nulls.
      ...(identity.email ? { email: identity.email } : {}),
      ...(identity.name ? { name: identity.name } : {}),
    },
    create: {
      authId: identity.authId,
      email: identity.email,
      name: identity.name,
    },
  });
}

/** Same as getCurrentUser but throws — for API routes that cannot proceed. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Not signed in");
    this.name = "UnauthorizedError";
  }
}
