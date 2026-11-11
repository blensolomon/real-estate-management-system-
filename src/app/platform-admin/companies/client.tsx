"use client";

import { useState } from "react";
import { suspendCompany, reactivateCompany } from "../actions";
import Link from "next/link";

interface CompanyWithData {
  id: string;
  name: string;
  active: boolean;
  suspendedAt: Date | null;
  createdAt: Date;
  subscription?: {
    plan: { name: string } | null;
  } | null;
  users: { id: string }[];
  projects: { id: string }[];
}

export function CompaniesClientPage({ companies }: { companies: CompanyWithData[] }) {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [showReasonDialog, setShowReasonDialog] = useState(false);
  const [actionType, setActionType] = useState<"suspend" | "reactivate" | null>(null);

  const handleAction = async (companyId: string, type: "suspend" | "reactivate") => {
    setSelectedCompany(companyId);
    setActionType(type);
    setShowReasonDialog(true);
  };

  const confirmAction = async () => {
    if (!selectedCompany || !actionType) return;

    setIsLoading(true);
    try {
      if (actionType === "suspend") {
        await suspendCompany(selectedCompany, actionReason);
      } else {
        await reactivateCompany(selectedCompany, actionReason);
      }
      // Reload page
      window.location.reload();
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsLoading(false);
      setShowReasonDialog(false);
      setActionReason("");
    }
  };

  return (
    <>
      <div className="bg-white rounded-lg shadow overflow-hidden">
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
                  Users
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Projects
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
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{company.name}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-600">
                      {company.subscription?.plan?.name || "Free"}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-600">{company.users.length}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-600">{company.projects.length}</div>
                  </td>
                  <td className="px-6 py-4">
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
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-600">
                      {company.createdAt.toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm space-x-2">
                    <Link
                      href={`/platform-admin/companies/${company.id}`}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      View
                    </Link>
                    {company.active ? (
                      <button
                        onClick={() => handleAction(company.id, "suspend")}
                        className="text-red-600 hover:text-red-900"
                        disabled={isLoading}
                      >
                        Suspend
                      </button>
                    ) : (
                      <button
                        onClick={() => handleAction(company.id, "reactivate")}
                        className="text-green-600 hover:text-green-900"
                        disabled={isLoading}
                      >
                        Reactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reason Dialog */}
      {showReasonDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {actionType === "suspend" ? "Suspend Company" : "Reactivate Company"}
              </h2>
            </div>
            <div className="px-6 py-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason
              </label>
              <textarea
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                rows={3}
                placeholder="Enter reason for this action..."
              />
            </div>
            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
              <button
                onClick={() => setShowReasonDialog(false)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                onClick={confirmAction}
                className={`px-4 py-2 text-white rounded-md ${
                  actionType === "suspend"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-green-600 hover:bg-green-700"
                }`}
                disabled={isLoading || !actionReason.trim()}
              >
                {isLoading ? "Processing..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
