"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/auth-client";

const DEMO_USERS = [
  { name: "Giulia", email: "giulia@lanterne.local" },
  { name: "Marco", email: "marco@lanterne.local" },
  { name: "Sara", email: "sara@lanterne.local" },
];
const DEMO_PASSWORD = "lanterne-demo";

export function SignInForm({ demo }: { demo: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function sendLink(formData: FormData) {
    setStatus("sending");
    const { error } = await authClient.signIn.magicLink({
      email: String(formData.get("email") ?? ""),
      callbackURL: "/",
    });
    setStatus(error ? "error" : "sent");
  }

  async function signInDemo(email: string) {
    const { error } = await authClient.signIn.email({ email, password: DEMO_PASSWORD });
    if (error) setStatus("error");
    else router.push("/");
  }

  if (status === "sent") {
    return <p role="status">Ti abbiamo mandato un link: controlla la posta.</p>;
  }

  return (
    <div className="space-y-6">
      <form action={sendLink} className="space-y-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="w-full rounded-lg border px-3 py-2"
          />
        </label>
        <Button type="submit" size="lg" disabled={status === "sending"} className="w-full">
          Mandami il link
        </Button>
        {status === "error" && (
          <p role="alert" className="text-sm text-destructive">
            Non è andata: riprova tra un momento.
          </p>
        )}
      </form>

      {demo && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Demo</p>
          {DEMO_USERS.map((u) => (
            <Button
              key={u.email}
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => signInDemo(u.email)}
            >
              Entra come {u.name}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
