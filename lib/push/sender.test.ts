import webPush from "web-push";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { webPushSender } from "./sender";

const sub = { endpoint: "https://push.example.test/a", p256dh: "chiave", auth: "segreto" };
const message = { title: "Lanterne", body: "Le lanterne di Marco sono arrivate", url: "/persone/1" };

beforeEach(() => {
  const keys = webPush.generateVAPIDKeys();
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", keys.publicKey);
  vi.stubEnv("VAPID_PRIVATE_KEY", keys.privateKey);
  vi.stubEnv("VAPID_SUBJECT", "mailto:prova@example.test");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

test("invia il messaggio come JSON e risponde sent", async () => {
  const spy = vi.spyOn(webPush, "sendNotification").mockResolvedValue({ statusCode: 201, body: "", headers: {} });

  expect(await webPushSender(sub, message)).toBe("sent");

  const [target, payload] = spy.mock.calls[0];
  expect(target).toEqual({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } });
  expect(JSON.parse(String(payload))).toEqual(message);
});

test.each([404, 410])("lo status %i significa che la sottoscrizione non esiste più", async (statusCode) => {
  vi.spyOn(webPush, "sendNotification").mockRejectedValue(Object.assign(new Error("x"), { statusCode }));
  expect(await webPushSender(sub, message)).toBe("gone");
});

test.each([
  ["un errore del servizio", Object.assign(new Error("x"), { statusCode: 500 })],
  ["un limite di frequenza", Object.assign(new Error("x"), { statusCode: 429 })],
  ["un errore di rete", new Error("ECONNRESET")],
])("%s non cancella la sottoscrizione", async (_, error) => {
  vi.spyOn(webPush, "sendNotification").mockRejectedValue(error);
  expect(await webPushSender(sub, message)).toBe("failed");
});

test("senza chiavi VAPID risponde failed invece di far cadere il job", async () => {
  vi.stubEnv("VAPID_PRIVATE_KEY", "");
  expect(await webPushSender(sub, message)).toBe("failed");
});
