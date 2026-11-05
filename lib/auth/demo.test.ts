import { expect, test } from "vitest";
import { isDemoLoginEnabled } from "./demo";

test.each([
  [{ DEMO_LOGIN: "true", NODE_ENV: "development" }, true],
  [{ DEMO_LOGIN: "true", NODE_ENV: "test" }, true],
  [{ DEMO_LOGIN: "true", NODE_ENV: "production" }, false],
  [{ DEMO_LOGIN: "true", NODE_ENV: undefined }, false],
  [{ DEMO_LOGIN: "true", NODE_ENV: "staging" }, false],
  [{ DEMO_LOGIN: "false", NODE_ENV: "development" }, false],
  [{ DEMO_LOGIN: undefined, NODE_ENV: "development" }, false],
])("login demo con %o → %s", (env, expected) => {
  expect(isDemoLoginEnabled(env)).toBe(expected);
});
