-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('APPROVED', 'PAID');

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('OWNER', 'MANAGER', 'AGENT', 'ACCOUNTANT', 'ADMIN');
ALTER TABLE "public"."User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING (CASE WHEN "role"::text = 'FINANCE' THEN 'ACCOUNTANT' ELSE "role"::text END::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'AGENT';
COMMIT;

-- DropForeignKey
ALTER TABLE "CommissionPayout" DROP CONSTRAINT "CommissionPayout_paidById_fkey";

-- AlterTable
ALTER TABLE "CommissionPayout" ADD COLUMN     "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "status" "PayoutStatus" NOT NULL DEFAULT 'APPROVED',
ALTER COLUMN "paidById" DROP NOT NULL,
ALTER COLUMN "paidAt" DROP NOT NULL,
ALTER COLUMN "paidAt" DROP DEFAULT;
-- Existing payouts were already paid: treat them as approved and paid by the same user.
UPDATE "CommissionPayout" SET "approvedById" = "paidById", "approvedAt" = COALESCE("paidAt", CURRENT_TIMESTAMP), "status" = 'PAID';
ALTER TABLE "CommissionPayout" ALTER COLUMN "approvedById" SET NOT NULL;

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN     "receiptSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "staleLeadDays" INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "receiptNo" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "external" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SalesTarget" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "SalesTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesTarget_companyId_month_idx" ON "SalesTarget"("companyId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "SalesTarget_userId_month_key" ON "SalesTarget"("userId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_companyId_receiptNo_key" ON "Payment"("companyId", "receiptNo");

-- AddForeignKey
ALTER TABLE "CommissionPayout" ADD CONSTRAINT "CommissionPayout_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPayout" ADD CONSTRAINT "CommissionPayout_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesTarget" ADD CONSTRAINT "SalesTarget_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesTarget" ADD CONSTRAINT "SalesTarget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

