-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "milestoneDueDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "penaltyCapPct" DECIMAL(5,2),
ADD COLUMN     "penaltyEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "penaltyGraceDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "penaltyPctPerMonth" DECIMAL(5,2) NOT NULL DEFAULT 0;
