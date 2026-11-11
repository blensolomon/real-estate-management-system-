import { requirePlatformSession } from "@/lib/platform-session";
import { db } from "@/lib/db";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function CompanyDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  await requirePlatformSession();

  const companyRaw = await db.company.findUnique({
    where: { id: params.id },
    include: {
      subscription: {
        include: {
          plan: {
            include: {
              features: true,
            },
          },
        },
      },
      users: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          active: true,
        },
      },
      projects: {
        select: {
          id: true,
          name: true,
        },
      },
      billingContacts: true,
      subscriptionPaymentMethods: true,
      invoices: {
        take: 5,
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!companyRaw) {
    notFound();
  }

  // Convert Decimal fields to strings
  const company = {
    ...companyRaw,
    discountApprovalPct: companyRaw.discountApprovalPct.toString(),
    commissionPayablePct: companyRaw.commissionPayablePct.toString(),
    penaltyPctPerMonth: companyRaw.penaltyPctPerMonth.toString(),
    penaltyCapPct: companyRaw.penaltyCapPct?.toString() || null,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link
            href="/platform-admin/companies"
            className="text-blue-600 hover:text-blue-900 text-sm mb-4 inline-block"
          >
            ← Back to Companies
          </Link>
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{company.name}</h1>
              <p className="text-gray-600 mt-1">Created: {company.createdAt.toLocaleDateString()}</p>
            </div>
            <span
              className={`px-4 py-2 rounded-full text-sm font-semibold ${
                company.active
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              {company.active ? "Active" : "Suspended"}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Subscription Info */}
            {company.subscription && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Subscription</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Plan</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {company.subscription.plan.name}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Status</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {company.subscription.status}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Billing Cycle</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {company.subscription.billingCycle}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Next Billing</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {company.subscription.nextBillingAt
                        ? company.subscription.nextBillingAt.toLocaleDateString()
                        : "N/A"}
                    </p>
                  </div>
                </div>

                {/* Plan Features */}
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Features</h3>
                  <ul className="space-y-2">
                    {company.subscription.plan.features.map((feature) => (
                      <li key={feature.id} className="flex justify-between text-sm">
                        <span className="text-gray-600">{feature.feature}</span>
                        <span className="text-gray-900 font-medium">
                          {feature.limit ? `${feature.limit}` : "Unlimited"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Users */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Users ({company.users.length})</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-0 text-gray-600">Name</th>
                      <th className="text-left py-2 px-0 text-gray-600">Email</th>
                      <th className="text-left py-2 px-0 text-gray-600">Role</th>
                      <th className="text-left py-2 px-0 text-gray-600">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {company.users.map((user) => (
                      <tr key={user.id}>
                        <td className="py-2 px-0">{user.name}</td>
                        <td className="py-2 px-0">{user.email}</td>
                        <td className="py-2 px-0">{user.role}</td>
                        <td className="py-2 px-0">
                          <span
                            className={`px-2 py-1 rounded text-xs font-semibold ${
                              user.active
                                ? "bg-green-100 text-green-800"
                                : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {user.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Projects */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Projects ({company.projects.length})</h2>
              {company.projects.length > 0 ? (
                <ul className="space-y-2">
                  {company.projects.map((project) => (
                    <li key={project.id} className="text-gray-600">
                      {project.name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-600">No projects</p>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Billing Contacts */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Billing Contacts</h3>
              {company.billingContacts.length > 0 ? (
                <ul className="space-y-3">
                  {company.billingContacts.map((contact) => (
                    <div key={contact.id} className="border-l-2 border-blue-500 pl-3">
                      <p className="text-sm font-medium text-gray-900">{contact.name}</p>
                      <p className="text-xs text-gray-600">{contact.email}</p>
                      {contact.phone && <p className="text-xs text-gray-600">{contact.phone}</p>}
                      {contact.isDefault && (
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded mt-1 inline-block">
                          Default
                        </span>
                      )}
                    </div>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-600">No billing contacts</p>
              )}
            </div>

            {/* Payment Methods */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Methods</h3>
              {company.subscriptionPaymentMethods.length > 0 ? (
                <ul className="space-y-3">
                  {company.subscriptionPaymentMethods.map((method) => (
                    <div
                      key={method.id}
                      className={`border-l-2 pl-3 ${
                        method.isDefault ? "border-green-500" : "border-gray-300"
                      }`}
                    >
                      <p className="text-sm font-medium text-gray-900">
                        {method.brand || method.type} •••• {method.last4}
                      </p>
                      {method.isDefault && (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded mt-1 inline-block">
                          Default
                        </span>
                      )}
                    </div>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-600">No payment methods</p>
              )}
            </div>

            {/* Recent Invoices */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Invoices</h3>
              {company.invoices.length > 0 ? (
                <ul className="space-y-2">
                  {company.invoices.map((invoice) => (
                    <div key={invoice.id} className="text-sm border-b pb-2 last:border-b-0">
                      <p className="font-medium text-gray-900">{invoice.invoiceNumber}</p>
                      <p className="text-xs text-gray-600">${invoice.totalAmount.toString()}</p>
                      <span
                        className={`text-xs px-2 py-1 rounded inline-block mt-1 ${
                          invoice.status === "PAID"
                            ? "bg-green-100 text-green-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {invoice.status}
                      </span>
                    </div>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-600">No invoices</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
