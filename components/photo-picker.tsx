"use client";

import { useState, type ChangeEvent } from "react";
import { compressPhoto } from "@/lib/client/compress-photo";
import { enqueue } from "@/lib/client/outbox-store";

export function PhotoPicker({
  userId,
  connectionId,
  expectedRevealAt,
}: {
  userId: string;
  connectionId: string;
  expectedRevealAt: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(file: File) {
    let blob: Blob;
    try {
      blob = await compressPhoto(file);
    } catch {
      setError("Questa foto non si riesce ad aprire: provane un'altra.");
      return;
    }
    await enqueue({ userId, connectionId, type: "photo", blob, expectedRevealAt });
  }

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setPending(true);
    setError(null);
    await send(file);
    setPending(false);
    // Così si può scegliere di nuovo la stessa foto.
    input.value = "";
  }

  return (
    <div className="space-y-1">
      <label className="block space-y-1">
        <span className="text-sm font-medium">{pending ? "Invio della foto…" : "Aggiungi una foto"}</span>
        <input
          type="file"
          accept="image/*"
          disabled={pending}
          onChange={choose}
          aria-label="Aggiungi una foto"
          className="block w-full text-sm"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
