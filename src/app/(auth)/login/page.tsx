import Link from "next/link";
import { Flash } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { login } from "../actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <form action={login} className="space-y-4">
      <h1 className="h2">Sign in</h1>
      <Flash error={error} />
      <div>
        <label className="lbl" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" className="input" required autoFocus />
      </div>
      <div>
        <label className="lbl" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" className="input" required />
      </div>
      <SubmitButton className="btn w-full">Sign in</SubmitButton>
      <p className="muted text-center">
        New company? <Link href="/register" className="link">Create an account</Link>
      </p>
      <div className="border-t border-slate-300 pt-4">
        <p className="muted text-center text-xs">
          <Link href="/platform-admin/login" className="link font-medium">
            Platform Administrator Login
          </Link>
        </p>
      </div>
    </form>
  );
}
