import { PrismaClient } from "@prisma/client";

// Next's dev server hot-reloads modules; without the global cache every reload
// opens a new pool and SQLite starts throwing "too many connections".
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
