import assert from "node:assert/strict";
import { nextStatus, verifySignature } from "./order_webhook_service.ts";
import { createHmac } from "node:crypto";

assert.equal(nextStatus("checkout.completed"), "paid");
const raw = JSON.stringify({ order_id: "o-1" });
const sig = createHmac("sha256", "s").update(raw).digest("hex");
assert.equal(verifySignature(raw, sig, "s"), true);
assert.equal(verifySignature(raw, "bad", "s"), false);
console.log("order decision and signature checks passed");
