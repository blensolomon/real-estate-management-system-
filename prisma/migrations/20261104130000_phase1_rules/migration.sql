-- CreateEnum
CREATE TYPE "UnitKind" AS ENUM ('APARTMENT', 'PLOT');
-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('CASH', 'INSTALLMENT', 'MORTGAGE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentType" ADD VALUE 'PAYMENT_PROOF';
ALTER TYPE "DocumentType" ADD VALUE 'TITLE';

-- AlterEnum
ALTER TYPE "LeadSource" ADD VALUE 'BILLBOARD';

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'VOID';

-- AlterEnum
ALTER TYPE "UnitStatus" ADD VALUE 'HANDED_OVER';

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "after" JSONB,
ADD COLUMN     "before" JSONB;

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "cancelReason" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "reversalOfId" TEXT,
ADD COLUMN     "voidReason" TEXT;

-- AlterTable
ALTER TABLE "Unit" ADD COLUMN     "kind" "UnitKind" NOT NULL DEFAULT 'APARTMENT',
ADD COLUMN     "titleStatus" TEXT,
ADD COLUMN     "zoning" TEXT;

-- CreateTable
CREATE TABLE "PaymentPlan" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "type" "PlanType" NOT NULL,
    "downPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "months" INTEGER NOT NULL DEFAULT 0,
    "bankName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentPlan_dealId_key" ON "PaymentPlan"("dealId");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_entity_entityId_idx" ON "AuditLog"("companyId", "entity", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reversalOfId_key" ON "Payment"("reversalOfId");

-- AddForeignKey
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Existing deals get a plan record derived from their schedule.
INSERT INTO "PaymentPlan" ("id", "dealId", "type", "months")
SELECT 'pp_' || d."id", d."id",
       CASE WHEN COUNT(i."id") FILTER (WHERE i."label" LIKE 'Installment%') > 0 THEN 'INSTALLMENT'::"PlanType" ELSE 'CASH'::"PlanType" END,
       COUNT(i."id") FILTER (WHERE i."label" LIKE 'Installment%')
FROM "Deal" d LEFT JOIN "Installment" i ON i."dealId" = d."id"
GROUP BY d."id";

-- Financial history is never hard-deleted. A maintenance job (e.g. the demo seed) may opt in per transaction:
--   SELECT set_config('resms.allow_purge', 'on', true);
CREATE OR REPLACE FUNCTION resms_purge_allowed() RETURNS boolean AS $$
  SELECT coalesce(current_setting('resms.allow_purge', true), '') = 'on'
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION resms_no_delete() RETURNS trigger AS $$
BEGIN
  IF resms_purge_allowed() THEN RETURN OLD; END IF;
  RAISE EXCEPTION '% records cannot be deleted; cancel or void them with a reason', TG_TABLE_NAME USING ERRCODE = 'P0001';
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION resms_audit_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND resms_purge_allowed() THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Audit log entries cannot be changed' USING ERRCODE = 'P0001';
END $$ LANGUAGE plpgsql;

-- Confirmed payments are immutable; corrections are new reversal rows. Rejected/void rows stay closed.
CREATE OR REPLACE FUNCTION resms_payment_guard() RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'CONFIRMED' AND (
       NEW."amount" IS DISTINCT FROM OLD."amount" OR NEW."dealId" IS DISTINCT FROM OLD."dealId"
    OR NEW."method" IS DISTINCT FROM OLD."method" OR NEW."reference" IS DISTINCT FROM OLD."reference"
    OR NEW."paidAt" IS DISTINCT FROM OLD."paidAt" OR NEW."status" IS DISTINCT FROM OLD."status"
    OR NEW."receiptNo" IS DISTINCT FROM OLD."receiptNo" OR NEW."reversalOfId" IS DISTINCT FROM OLD."reversalOfId"
    OR NEW."confirmedById" IS DISTINCT FROM OLD."confirmedById" OR NEW."confirmedAt" IS DISTINCT FROM OLD."confirmedAt") THEN
    RAISE EXCEPTION 'Confirmed payments are locked; record a reversal instead' USING ERRCODE = 'P0001';
  END IF;
  IF OLD."status" IN ('REJECTED', 'VOID') AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    RAISE EXCEPTION 'Rejected or void payments cannot be reopened' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER payment_guard BEFORE UPDATE ON "Payment" FOR EACH ROW EXECUTE FUNCTION resms_payment_guard();
CREATE TRIGGER payment_no_delete BEFORE DELETE ON "Payment" FOR EACH ROW EXECUTE FUNCTION resms_no_delete();
CREATE TRIGGER deal_no_delete BEFORE DELETE ON "Deal" FOR EACH ROW EXECUTE FUNCTION resms_no_delete();
CREATE TRIGGER installment_no_delete BEFORE DELETE ON "Installment" FOR EACH ROW EXECUTE FUNCTION resms_no_delete();
CREATE TRIGGER reservation_no_delete BEFORE DELETE ON "Reservation" FOR EACH ROW EXECUTE FUNCTION resms_no_delete();
CREATE TRIGGER payout_no_delete BEFORE DELETE ON "CommissionPayout" FOR EACH ROW EXECUTE FUNCTION resms_no_delete();
CREATE TRIGGER plan_no_delete BEFORE DELETE ON "PaymentPlan" FOR EACH ROW EXECUTE FUNCTION resms_no_delete();
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION resms_audit_immutable();
