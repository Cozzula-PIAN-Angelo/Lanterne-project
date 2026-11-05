import { revealTimeOptions } from "@/lib/time/reveal-time";

export function RevealTimeSelect({ name, defaultValue }: { name: string; defaultValue?: string }) {
  return (
    <select name={name} defaultValue={defaultValue} className="w-full rounded-lg border px-3 py-2">
      {revealTimeOptions().map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
