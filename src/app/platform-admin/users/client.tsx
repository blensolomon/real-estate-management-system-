"use client";

import { useState } from "react";
import { createPlatformUser, deactivatePlatformUser } from "../actions";
import type { PlatformUserRole } from "@prisma/client";

interface PlatformUserData {
  id: string;
  email: string;
  name: string;
  role: PlatformUserRole;
  active: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

const ROLES: PlatformUserRole[] = ["ADMIN", "BILLING_MANAGER", "SUPPORT", "VIEWER"];

export function PlatformUsersClient({
  users,
}: {
  users: PlatformUserData[];
}) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    name: "",
    password: "",
    role: "VIEWER" as PlatformUserRole,
  });
  const [error, setError] = useState("");

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await createPlatformUser(formData);
      setFormData({ email: "", name: "", password: "", role: "VIEWER" });
      setShowCreateForm(false);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creating user");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeactivateUser = async (userId: string) => {
    if (!confirm("Are you sure you want to deactivate this user?")) return;

    setIsLoading(true);
    try {
      await deactivatePlatformUser(userId);
      window.location.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error deactivating user");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {showCreateForm && (
        <div className="mb-8 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Create New Platform Admin</h2>
          <form onSubmit={handleCreateUser} className="space-y-4">
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as PlatformUserRole })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {isLoading ? "Creating..." : "Create User"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900">Platform Admins</h2>
          {!showCreateForm && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Add New Admin
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Login</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4"><div className="text-sm font-medium text-gray-900">{user.name}</div></td>
                  <td className="px-6 py-4"><div className="text-sm text-gray-600">{user.email}</div></td>
                  <td className="px-6 py-4"><span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">{user.role}</span></td>
                  <td className="px-6 py-4"><span className={`px-2 py-1 text-xs font-semibold rounded ${user.active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>{user.active ? "Active" : "Inactive"}</span></td>
                  <td className="px-6 py-4"><div className="text-sm text-gray-600">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : "Never"}</div></td>
                  <td className="px-6 py-4"><div className="text-sm text-gray-600">{user.createdAt.toLocaleDateString()}</div></td>
                  <td className="px-6 py-4 text-sm"><button onClick={() => handleDeactivateUser(user.id)} disabled={isLoading || !user.active} className="text-red-600 hover:text-red-900 disabled:opacity-50">Deactivate</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
