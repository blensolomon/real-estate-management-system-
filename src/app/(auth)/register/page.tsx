import Link from "next/link";
import { Flash } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { register } from "../actions";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <form action={register} className="space-y-4">
      <h1 className="h2">Create your company account</h1>
      <Flash error={error} />
      <div>
        <label className="lbl">Company name</label>
        <input name="company" className="input" required placeholder="e.g. Addis Homes Real Estate" />
      </div>
      <div>
        <label className="lbl">Your name</label>
        <input name="name" className="input" required />
      </div>
      <div>
        <label className="lbl">Email</label>
        <input name="email" type="email" className="input" required />
      </div>
      <div>
        <label className="lbl">Password (min 8 chars)</label>
        <input name="password" type="password" minLength={8} className="input" required />
      </div>
      <SubmitButton className="btn w-full">Create account</SubmitButton>
      <p className="muted text-center">
        Already have an account? <Link href="/login" className="link">Sign in</Link>
      </p>
    </form>
  );
}
