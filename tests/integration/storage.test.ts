import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createStorage } from "@/lib/storage/s3";

const storage = createStorage(process.env);
const newKey = () => `test/${randomUUID()}`;
const bytes = (n: number) => new Uint8Array(n).fill(7);

async function upload(key: string, size = 4, mime = "audio/webm") {
  const { url, headers } = await storage.signUpload({ key, mime, bytes: size });
  return fetch(url, { method: "PUT", headers, body: bytes(size) });
}

describe("MediaStorage", () => {
  beforeAll(() => storage.ensureBucket());

  it("un PUT con la dimensione firmata riesce e stat la legge", async () => {
    const key = newKey();
    const res = await upload(key);
    expect(res.ok).toBe(true);
    expect(await storage.stat(key)).toEqual({ bytes: 4, mime: "audio/webm" });
  });

  it.each([
    ["più grande", 5],
    ["più piccolo", 3],
  ])("un PUT %s della dimensione firmata viene rifiutato", async (_, size) => {
    const key = newKey();
    const { url, headers } = await storage.signUpload({ key, mime: "audio/webm", bytes: 4 });
    const res = await fetch(url, { method: "PUT", headers, body: bytes(size) });
    expect(res.ok).toBe(false);
    expect(await storage.stat(key)).toBeNull();
  });

  it("un PUT con un altro tipo viene rifiutato", async () => {
    const key = newKey();
    const { url } = await storage.signUpload({ key, mime: "audio/webm", bytes: 4 });
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: bytes(4),
    });
    expect(res.ok).toBe(false);
    expect(await storage.stat(key)).toBeNull();
  });

  it("senza firma l'oggetto non si legge", async () => {
    const key = newKey();
    await upload(key);
    const signed = new URL(await storage.signRead(key));
    const res = await fetch(`${signed.origin}${signed.pathname}`);
    expect(res.status).toBe(403);
  });

  it("la lettura firmata funziona e dura 5 minuti", async () => {
    const key = newKey();
    await upload(key);
    const url = await storage.signRead(key);
    expect(new URL(url).searchParams.get("X-Amz-Expires")).toBe("300");
    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect((await res.arrayBuffer()).byteLength).toBe(4);
  });

  it("anche la firma di upload dura 5 minuti", async () => {
    const { url } = await storage.signUpload({ key: newKey(), mime: "audio/webm", bytes: 4 });
    expect(new URL(url).searchParams.get("X-Amz-Expires")).toBe("300");
  });

  it("stat di un oggetto inesistente è null", async () => {
    expect(await storage.stat(newKey())).toBeNull();
  });

  it("remove è idempotente", async () => {
    const key = newKey();
    await upload(key);
    await storage.remove(key);
    await storage.remove(key);
    expect(await storage.stat(key)).toBeNull();
  });

  it("ensureBucket si può chiamare più volte", async () => {
    await expect(storage.ensureBucket()).resolves.toBeUndefined();
  });
});
