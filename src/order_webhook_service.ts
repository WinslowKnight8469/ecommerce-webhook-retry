import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { InfraiClient } from "./infrai_client.ts";

export const checkoutBody = z.object({ order_id: z.string().min(1), customer_email: z.string().email(), total_usd: z.number().positive() });
export type Checkout = z.infer<typeof checkoutBody>;
export type OrderEvent = Checkout & { event: "checkout.completed" | "fulfillment.updated" | "receipt.issued" | "customer.order.updated"; status: string };

export function verifySignature(raw: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const left = Buffer.from(expected); const right = Buffer.from(signature);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function nextStatus(event: OrderEvent["event"]): string {
  if (event === "checkout.completed") return "paid";
  if (event === "fulfillment.updated") return "fulfilled";
  if (event === "receipt.issued") return "receipted";
  return "customer_notified";
}

export async function configureWebhook(client: InfraiClient, url: string, secret: string) {
  return client.request<{ id: string }>("/v1/account/webhooks/register", "POST", {
    url, events: ["checkout.completed", "fulfillment.updated", "receipt.issued", "customer.order.updated"], secret,
    description: "Order lifecycle receiver",
  });
}

export async function publishOrderEvent(client: InfraiClient, queue: string, event: OrderEvent) {
  return client.request<{ message_id: string }>("/v1/queue/publish", "POST", { queue, payload: event });
}

export async function inspectDeliveries(client: InfraiClient, webhookId: string) {
  return client.request<unknown>(`/v1/account/webhooks/deliveries/${encodeURIComponent(webhookId)}`, "GET");
}

export async function redriveFailed(client: InfraiClient, queue: string) {
  return client.request<unknown>(`/v1/queue/dlq/redrive/${encodeURIComponent(queue)}`, "POST", { queue });
}
