import test from "node:test";
import assert from "node:assert/strict";
import { normalizePhone } from "../worker.js";

test("normalizes Bangladesh phone numbers", () => {
  assert.equal(normalizePhone("+8801712345678"), "01712345678");
  assert.equal(normalizePhone("8801812345678"), "01812345678");
});
