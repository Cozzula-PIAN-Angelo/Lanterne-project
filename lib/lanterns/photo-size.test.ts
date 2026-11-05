import { describe, expect, it } from "vitest";
import { scaledSize } from "./photo-size";

describe("scaledSize", () => {
  it("riduce il lato lungo e mantiene le proporzioni", () => {
    expect(scaledSize(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(scaledSize(3000, 4000, 2048)).toEqual({ width: 1536, height: 2048 });
    expect(scaledSize(5000, 5000, 2048)).toEqual({ width: 2048, height: 2048 });
  });

  it("non ingrandisce mai", () => {
    expect(scaledSize(800, 600, 2048)).toEqual({ width: 800, height: 600 });
    expect(scaledSize(2048, 1000, 2048)).toEqual({ width: 2048, height: 1000 });
  });

  it("non scende mai sotto un pixel", () => {
    expect(scaledSize(10000, 1, 2048)).toEqual({ width: 2048, height: 1 });
  });
});
