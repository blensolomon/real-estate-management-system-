import { guardPlatformCompanies } from "@/lib/route-guards";
import { db } from "@/lib/db";
import Link from "next/link";
import { CompaniesClientPage } from "./client";
import { CreateCompanyForm } from "./create-form";

export default async function CompaniesPage() {
  // Guard the route
  await guardPlatformCompanies();

  // Fetch companies with subscription info
  const companiesRaw = await db.company.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      subscription: {
        include: {
          plan: true,
        },
      },
      users: {
        select: { id: true },
      },
      projects: {
        select: { id: true },
      },
    },
  });

  // Convert Decimal fields to strings for client component
  const companies = companiesRaw.map((c) => ({
    ...c,
    discountApprovalPct: c.discountApprovalPct.toString(),
    commissionPayablePct: c.commissionPayablePct.toString(),
    penaltyPctPerMonth: c.penaltyPctPerMonth.toString(),
    penaltyCapPct: c.penaltyCapPct?.toString() || null,
    createdAt: c.createdAt,
    suspendedAt: c.suspendedAt,
    planUpdatedAt: c.planUpdatedAt,
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link href="/platform-admin" className="text-blue-600 hover:text-blue-900 text-sm mb-4 inline-block">
            ← Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Manage Companies</h1>
          <p className="text-gray-600 mt-1">Total: {companies.length} companies</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Create Company Section */}
        <CreateCompanyForm />

        {/* Companies List */}
        <CompaniesClientPage companies={companies} />
      </div>
    </div>
  );
}
