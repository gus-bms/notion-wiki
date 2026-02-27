import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __notionWikiPrisma__: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global.__notionWikiPrisma__ ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["warn", "error"]
  });

if (process.env.NODE_ENV !== "production") {
  global.__notionWikiPrisma__ = prisma;
}
