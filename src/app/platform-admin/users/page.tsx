import { guardPlatformUsers } from "@/lib/route-guards";
import { db } from "@/lib/db";
import Link from "next/link";
import { PlatformUsersClient } from "./client";

export default async function PlatformUsersPage() {
  // Guard the route
  await guardPlatformUsers();

  const users = await db.platformUser.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link href="/platform-admin" className="text-blue-600 hover:text-blue-900 text-sm mb-4 inline-block">
            ← Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Platform Admins</h1>
          <p className="text-gray-600 mt-1">Total: {users.length} platform admins</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PlatformUsersClient users={users} />
      </div>
    </div>
  );
}
