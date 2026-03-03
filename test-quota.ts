import { GeminiProvider } from "./packages/llm-provider/src/geminiProvider";
import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();

async function runTest() {
  console.log("1. Testing Gemini API directly with a single tiny chunk...");
  const provider = new GeminiProvider(process.env.GEMINI_API_KEY!);
  
  console.log("\nChecking chunk processing progress...");
  const prisma = new PrismaClient();
  const chunkCount = await prisma.documentChunk.count();
  const refCount = await prisma.embeddingRef.count();
  console.log(`Total Chunks in DB: ${chunkCount}`);
  
  const latestChunk = await prisma.documentChunk.findFirst({
    orderBy: { updatedAt: 'desc' },
    select: { chunkId: true, updatedAt: true }
  });
  console.log("Latest chunk updated at:", latestChunk?.updatedAt);

  await prisma.$disconnect();
}

runTest().catch((e) => {
  console.error(e);
  process.exit(1);
});
