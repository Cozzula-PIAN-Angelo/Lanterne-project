import { describe, expect, it } from "vitest";
import { pickRecorderMime } from "./recorder-mime";

const supports = (...mimes: string[]) => (mime: string) => mimes.includes(mime);

describe("pickRecorderMime", () => {
  it("preferisce AAC in MP4", () => {
    expect(pickRecorderMime(() => true)).toBe("audio/mp4;codecs=mp4a.40.2");
  });

  it("ripiega nell'ordine previsto", () => {
    expect(pickRecorderMime(supports("audio/webm", "audio/mp4"))).toBe("audio/mp4");
    expect(pickRecorderMime(supports("audio/webm", "audio/webm;codecs=opus"))).toBe("audio/webm;codecs=opus");
    expect(pickRecorderMime(supports("audio/webm"))).toBe("audio/webm");
  });

  it("senza formati supportati restituisce null", () => {
    expect(pickRecorderMime(() => false)).toBeNull();
  });
});
