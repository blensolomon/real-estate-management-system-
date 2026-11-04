-- Platform admins can suspend a company; suspended companies cannot sign in.
ALTER TABLE "Company" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "suspendedAt" TIMESTAMP(3);
