"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyLink({ link }: { link: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setStatus("copied");
    } catch {
      // Gli appunti possono essere negati: il link resta lì da selezionare a mano.
      setStatus("failed");
    }
  }

  return (
    <div className="space-y-2">
      <label className="block space-y-1">
        <span className="text-sm font-medium">Link dell&apos;invito</span>
        <input
          readOnly
          value={link}
          onFocus={(e) => e.target.select()}
          className="w-full rounded-lg border px-3 py-2"
        />
      </label>
      <Button type="button" size="lg" onClick={copy} className="w-full">
        {status === "copied" ? "Copiato" : "Copia"}
      </Button>
      {status === "failed" && (
        <p role="alert" className="text-sm text-destructive">
          Non riesco a copiarlo: selezionalo e copialo a mano.
        </p>
      )}
    </div>
  );
}
