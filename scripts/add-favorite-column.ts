import { PrismaClient } from "@/app/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  try {
    // 使用原始 SQL 添加 favorite 列
    await prisma.$executeRaw`
      ALTER TABLE "Thread" 
      ADD COLUMN IF NOT EXISTS "favorite" BOOLEAN DEFAULT false;
    `;
    console.log("✅ Successfully added favorite column to Thread table");
  } catch (error) {
    console.error("Error adding favorite column:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
