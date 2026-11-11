import { guardPlatformDashboard } from "@/lib/route-guards";
import { getPlatformSession } from "@/lib/platform-session";
import { db } from "@/lib/db";
import Link from "next/link";
import { platformAdminLogout } from "./actions";
import { IfPlatformPermission } from "@/components/permission-ui";

export default async function PlatformAdminDashboard() {
  // Guard the route - this will throw if user doesn't have permission
  await guardPlatformDashboard();
  const session = await getPlatformSession();
  
  // Session is guaranteed to exist if guard passed
  if (!session) throw new Error("Session not found");

  // Get dashboard stats
  const [totalCompanies, activeCompanies, suspendedCompanies, totalPlans] = await Promise.all([
    db.company.count(),
    db.company.count({ where: { active: true } }),
    db.company.count({ where: { active: false } }),
    db.plan.count({ where: { active: true } }),
  ]);

  // Get recent platform activity
  const recentActivity = await db.platformAuditLog.findMany({
    take: 10,
    orderBy: { createdAt: "desc" },
    include: {
      platformUser: true,
    },
  });

  // Get companies with subscription status
  const companies = await db.company.findMany({
    take: 20,
    orderBy: { createdAt: "desc" },
    include: {
      subscription: {
        include: {
          plan: true,
        },
      },
    },
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">Platform Admin</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              {session.name} ({session.role})
            </span>
            <form action={platformAdminLogout}>
              <button
                type="submit"
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700"
              >
                Logout
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 uppercase">Total Companies</h3>
            <p className="mt-2 text-3xl font-extrabold text-gray-900">{totalCompanies}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 uppercase">Active Companies</h3>
            <p className="mt-2 text-3xl font-extrabold text-green-600">{activeCompanies}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 uppercase">Suspended</h3>
            <p className="mt-2 text-3xl font-extrabold text-red-600">{suspendedCompanies}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 uppercase">Active Plans</h3>
            <p className="mt-2 text-3xl font-extrabold text-blue-600">{totalPlans}</p>
          </div>
        </div>

        {/* Navigation */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <IfPlatformPermission role={session!.role} action="VIEW_COMPANIES" fallback={null}>
            <Link
              href="/platform-admin/companies"
              className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition"
            >
              <h3 className="text-lg font-semibold text-gray-900">Manage Companies</h3>
              <p className="mt-2 text-sm text-gray-600">
                View, suspend, and manage all company accounts
              </p>
            </Link>
          </IfPlatformPermission>
          <IfPlatformPermission role={session!.role} action="VIEW_SUBSCRIPTIONS" fallback={null}>
            <Link
              href="/platform-admin/subscriptions"
              className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition"
            >
              <h3 className="text-lg font-semibold text-gray-900">Subscriptions</h3>
              <p className="mt-2 text-sm text-gray-600">
                Manage plans, billing cycles, and feature overrides
              </p>
            </Link>
          </IfPlatformPermission>
          <IfPlatformPermission role={session!.role} action="VIEW_USERS" fallback={null}>
            <Link
              href="/platform-admin/users"
              className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition"
            >
              <h3 className="text-lg font-semibold text-gray-900">Platform Users</h3>
              <p className="mt-2 text-sm text-gray-600">
                Create and manage platform admin accounts
              </p>
            </Link>
          </IfPlatformPermission>
        </div>

        {/* Recent Companies */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Recent Companies</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Company
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Plan
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {companies.map((company) => (
                  <tr key={company.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {company.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {company.subscription?.plan.name || "None"}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          company.active
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {company.active ? "Active" : "Suspended"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {company.createdAt.toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <Link
                        href={`/platform-admin/companies/${company.id}`}
                        className="text-blue-600 hover:text-blue-900 font-medium"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {recentActivity.map((activity) => (
              <div key={activity.id} className="px-6 py-4">
                <div className="flex justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {activity.action}
                    </p>
                    <p className="text-sm text-gray-600">{activity.detail}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">
                      {activity.platformUser?.name || "System"}
                    </p>
                    <p className="text-xs text-gray-400">
                      {activity.createdAt.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
