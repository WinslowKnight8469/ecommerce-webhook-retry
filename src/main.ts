import { InfraiClient } from "./infrai_client.ts";
import { checkoutBody, configureWebhook, inspectDeliveries, nextStatus, publishOrderEvent, redriveFailed, verifySignature } from "./order_webhook_service.ts";

const key = process.env.INFRAI_API_KEY;
if (!key) throw new Error("Set INFRAI_API_KEY");
const client = new InfraiClient(key);
const secret = process.env.WEBHOOK_SECRET ?? "local-demo-secret";
const port = Number(process.env.PORT ?? 8787);

// Node's built-in HTTP server keeps the example dependency-light.
import { createServer } from "node:http";
const httpServer = createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/checkout") { res.statusCode = 404; res.end(); return; }
  const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  const signature = String(req.headers["x-infrai-signature"] ?? "");
  if (!verifySignature(raw, signature, secret)) { res.statusCode = 401; res.end(JSON.stringify({ error: "invalid signature" })); return; }
  try {
    const checkout = checkoutBody.parse(JSON.parse(raw));
    const event = { ...checkout, event: "checkout.completed" as const, status: nextStatus("checkout.completed") };
    const result = await publishOrderEvent(client, "orders", event);
    res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ accepted: true, message_id: result.message_id }));
  } catch (error) { res.statusCode = 400; res.end(JSON.stringify({ error: error instanceof Error ? error.message : "invalid request" })); }
});
httpServer.listen(port, () => console.log(`checkout receiver listening on ${port}`));

if (process.env.REGISTER_WEBHOOK === "1") {
  const webhook = await configureWebhook(client, `http://localhost:${port}/checkout`, secret);
  console.log({ webhook_id: webhook.id });
  console.log(await inspectDeliveries(client, webhook.id));
}
if (process.env.REDRIVE_QUEUE) console.log(await redriveFailed(client, process.env.REDRIVE_QUEUE));
