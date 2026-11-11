import { requirePlatformSession } from "@/lib/platform-session";
import { db } from "@/lib/db";
import Link from "next/link";

export default async function SubscriptionsPage() {
  await requirePlatformSession();

  const plansRaw = await db.plan.findMany({
    orderBy: { monthlyPrice: "asc" },
    include: {
      features: true,
      subscriptions: true,
    },
  });

  const subscriptionsRaw = await db.subscription.findMany({
    take: 20,
    orderBy: { createdAt: "desc" },
    include: {
      company: true,
      plan: true,
    },
  });

  // Convert Decimal fields to strings
  const plans = plansRaw.map((p) => ({
    ...p,
    monthlyPrice: p.monthlyPrice.toString(),
    yearlyPrice: p.yearlyPrice?.toString() || null,
  }));

  const subscriptions = subscriptionsRaw.map((s) => ({
    ...s,
    plan: {
      ...s.plan,
      monthlyPrice: s.plan.monthlyPrice.toString(),
      yearlyPrice: s.plan.yearlyPrice?.toString() || null,
    },
  }));

  const totalMonthlyRevenue = subscriptionsRaw.reduce((total, sub) => {
    return total + parseFloat(sub.plan.monthlyPrice.toString());
  }, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link href="/platform-admin" className="text-blue-600 hover:text-blue-900 text-sm mb-4 inline-block">
            ← Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Subscriptions & Plans</h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 uppercase">Active Subscriptions</h3>
            <p className="mt-2 text-3xl font-extrabold text-gray-900">{subscriptions.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 uppercase">Monthly Revenue</h3>
            <p className="mt-2 text-3xl font-extrabold text-green-600">${totalMonthlyRevenue.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 uppercase">Active Plans</h3>
            <p className="mt-2 text-3xl font-extrabold text-blue-600">{plans.length}</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Plans</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plan Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Monthly Price</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Annual Price</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subscribers</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Features</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {plans.map((plan) => (
                  <tr key={plan.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4"><div className="text-sm font-medium text-gray-900">{plan.name}</div></td>
                    <td className="px-6 py-4"><div className="text-sm text-gray-600">${plan.monthlyPrice.toString()}</div></td>
                    <td className="px-6 py-4"><div className="text-sm text-gray-600">{plan.yearlyPrice ? `$${plan.yearlyPrice.toString()}` : "—"}</div></td>
                    <td className="px-6 py-4"><div className="text-sm text-gray-600">{plan.subscriptions.length}</div></td>
                    <td className="px-6 py-4"><div className="text-sm text-gray-600">{plan.features.length}</div></td>
                    <td className="px-6 py-4"><span className={`px-2 py-1 rounded-full text-xs font-semibold ${plan.active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>{plan.active ? "Active" : "Inactive"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Recent Subscriptions</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plan</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Billing Cycle</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Next Billing</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {subscriptions.map((subscription) => (
                  <tr key={subscription.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4"><Link href={`/platform-admin/companies/${subscription.companyId}`} className="text-sm font-medium text-blue-600 hover:text-blue-900">{subscription.company.name}</Link></td>
                    <td className="px-6 py-4"><div className="text-sm text-gray-600">{subscription.plan.name}</div></td>
                    <td className="px-6 py-4"><span className={`px-2 py-1 rounded-full text-xs font-semibold ${subscription.status === "ACTIVE" ? "bg-green-100 text-green-800" : subscription.status === "CANCELLED" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}`}>{subscription.status}</span></td>
                    <td className="px-6 py-4"><div className="text-sm text-gray-600">{subscription.billingCycle}</div></td>
                    <td className="px-6 py-4"><div className="text-sm text-gray-600">{subscription.nextBillingAt ? subscription.nextBillingAt.toLocaleDateString() : "—"}</div></td>
                    <td className="px-6 py-4"><div className="text-sm text-gray-600">{subscription.createdAt.toLocaleDateString()}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
