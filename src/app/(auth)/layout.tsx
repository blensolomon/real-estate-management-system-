export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-900 to-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center text-white">
          <div className="text-2xl font-semibold">Real Estate Sales Manager</div>
          <div className="mt-1 text-sm text-emerald-100">
            Know who owes you money, who sold what, and which units are really available.
          </div>
        </div>
        <div className="card">{children}</div>
      </div>
    </div>
  );
}
