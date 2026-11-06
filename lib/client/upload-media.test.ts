import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { confirmUploadAction, requestUploadAction } from "@/app/(app)/actions/media";
import { UPLOAD_TIMEOUT_MS, uploadMedia } from "./upload-media";

vi.mock("@/app/(app)/actions/media", () => ({
  requestUploadAction: vi.fn(),
  confirmUploadAction: vi.fn(),
}));

const TICKET = {
  lanternId: "l1",
  uploadUrl: "http://storage.test/file",
  uploadHeaders: {},
  revealAt: "2026-11-03T02:30:00.000Z",
};
const input = {
  connectionId: "c1",
  type: "audio" as const,
  blob: new Blob(["voce"], { type: "audio/webm" }),
  durationSec: 3,
};

beforeEach(() => {
  vi.mocked(requestUploadAction).mockResolvedValue(TICKET);
  vi.mocked(confirmUploadAction).mockResolvedValue({ redirectTo: "/" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test("salva il biglietto dopo il caricamento e prima della conferma", async () => {
  const order: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      order.push("put");
      return new Response(null, { status: 200 });
    }),
  );
  vi.mocked(confirmUploadAction).mockImplementation(async () => {
    order.push("confirm");
    return { redirectTo: "/" };
  });

  const outcome = await uploadMedia({
    ...input,
    onUploaded: async (ticket) => {
      order.push(`saved ${ticket.lanternId}`);
    },
  });

  expect(outcome).toEqual({ kind: "sent", revealAt: TICKET.revealAt });
  expect(order).toEqual(["put", "saved l1", "confirm"]);
});

test("con il file già caricato ripete solo la conferma", async () => {
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);

  const outcome = await uploadMedia({ ...input, uploaded: { lanternId: "l1", revealAt: TICKET.revealAt } });

  expect(outcome).toEqual({ kind: "sent", revealAt: TICKET.revealAt });
  expect(requestUploadAction).not.toHaveBeenCalled();
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(confirmUploadAction).toHaveBeenCalledWith({ connectionId: "c1", lanternId: "l1" });
});

test("un PUT bloccato scade e diventa errore di rete", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("scaduto", "AbortError")));
        }),
    ),
  );

  const pending = uploadMedia(input);
  await vi.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS);

  await expect(pending).resolves.toEqual({ kind: "network" });
  expect(confirmUploadAction).not.toHaveBeenCalled();
});
