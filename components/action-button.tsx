"use client";

import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { useActionForm } from "@/components/use-action-form";
import type { ActionResult } from "@/lib/messages";

type Props = Omit<ComponentProps<typeof Button>, "type" | "action"> & {
  action: (formData: FormData) => Promise<ActionResult>;
  fields: Record<string, string>;
};

/** Un pulsante che chiama una Server Action con dei campi nascosti e mostra l'eventuale errore. */
export function ActionButton({ action, fields, children, disabled, ...buttonProps }: Props) {
  const [error, formAction, pending] = useActionForm(action);
  return (
    <form action={formAction}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button type="submit" disabled={pending || disabled} {...buttonProps}>
        {children}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
