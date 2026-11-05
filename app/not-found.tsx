import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-10">
      <h1 className="text-2xl font-semibold">Qui non c&apos;è niente.</h1>
      <Link href="/" className="underline">
        Torna alle tue persone
      </Link>
    </main>
  );
}
