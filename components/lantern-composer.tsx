"use client";

import { useState } from "react";
import { sendTextAction, sendThoughtAction } from "@/app/(app)/actions/lanterns";
import { AudioRecorder } from "@/components/audio-recorder";
import { PhotoPicker } from "@/components/photo-picker";
import { Button } from "@/components/ui/button";
import { useActionForm } from "@/components/use-action-form";
import { TEXT_MAX, THOUGHTS } from "@/lib/lanterns/constants";

export function LanternComposer({
  userId,
  connectionId,
  expectedRevealAt,
}: {
  userId: string;
  connectionId: string;
  /** Quando partirebbe adesso: se poi parte più tardi, la coda offline lo fa sapere. */
  expectedRevealAt: string;
}) {
  const [text, setText] = useState("");
  const [textError, textAction, textPending] = useActionForm(async (formData) => {
    const result = await sendTextAction(formData);
    if ("redirectTo" in result) setText("");
    return result;
  });
  const [thoughtError, thoughtAction, thoughtPending] = useActionForm(sendThoughtAction);
  const error = textError ?? thoughtError;

  return (
    <div className="space-y-4">
      <AudioRecorder userId={userId} connectionId={connectionId} expectedRevealAt={expectedRevealAt} />
      <PhotoPicker userId={userId} connectionId={connectionId} expectedRevealAt={expectedRevealAt} />

      <form action={textAction} className="space-y-2">
        <input type="hidden" name="connectionId" value={connectionId} />
        <label className="block space-y-1">
          <span className="text-sm font-medium">La tua lanterna</span>
          <textarea
            name="text"
            required
            rows={3}
            maxLength={TEXT_MAX}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full rounded-lg border px-3 py-2"
          />
        </label>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            {text.length}/{TEXT_MAX}
          </span>
          <Button type="submit" disabled={textPending}>
            Lascia la lanterna
          </Button>
        </div>
      </form>

      <form action={thoughtAction} className="flex flex-wrap gap-2">
        <input type="hidden" name="connectionId" value={connectionId} />
        {THOUGHTS.map((thought) => (
          <Button
            key={thought.id}
            type="submit"
            name="thoughtId"
            value={thought.id}
            variant="outline"
            disabled={thoughtPending}
            className="h-auto whitespace-normal text-left"
          >
            {thought.text}
          </Button>
        ))}
      </form>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
