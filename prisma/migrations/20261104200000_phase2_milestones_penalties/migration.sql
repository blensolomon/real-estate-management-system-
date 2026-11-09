-- CreateEnum
CREATE TYPE "PenaltyStatus" AS ENUM ('OPEN', 'WAIVED', 'COLLECTED');

-- AlterEnum
ALTER TYPE "PlanType" ADD VALUE 'MILESTONE';

-- AlterTable
ALTER TABLE "Installment" ADD COLUMN     "milestoneId" TEXT;

-- CreateTable
CREATE TABLE "ConstructionMilestone" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "pct" DECIMAL(5,2) NOT NULL,
    "expectedAt" TIMESTAMP(3) NOT NULL,
    "reachedAt" TIMESTAMP(3),
    "reachedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConstructionMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Penalty" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "installmentId" TEXT NOT NULL,
    "monthNo" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "PenaltyStatus" NOT NULL DEFAULT 'OPEN',
    "reason" TEXT,
    "reference" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Penalty_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConstructionMilestone_companyId_idx" ON "ConstructionMilestone"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ConstructionMilestone_projectId_seq_key" ON "ConstructionMilestone"("projectId", "seq");

-- CreateIndex
CREATE INDEX "Penalty_companyId_status_idx" ON "Penalty"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Penalty_installmentId_monthNo_key" ON "Penalty"("installmentId", "monthNo");

-- AddForeignKey
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "ConstructionMilestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstructionMilestone" ADD CONSTRAINT "ConstructionMilestone_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstructionMilestone" ADD CONSTRAINT "ConstructionMilestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Penalty" ADD CONSTRAINT "Penalty_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Penalty" ADD CONSTRAINT "Penalty_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Penalty" ADD CONSTRAINT "Penalty_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "Installment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Penalties are never deleted (waive or collect instead).
CREATE TRIGGER penalty_no_delete BEFORE DELETE ON "Penalty" FOR EACH ROW EXECUTE FUNCTION resms_no_delete();
