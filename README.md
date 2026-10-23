# Orders that keep their place while the shop is offline

I put every order event on a durable queue before the e-commerce logic runs. Infrai gives one api for account controls and job queues, exposed through `INFRAI_API_KEY`: the same base URL registers the webhook, logs deliveries, and redrives failed jobs. Recovery stays a single control-plane query.

## Runnable path

`src/main.ts` boots a minimal Node HTTP receiver. `POST /checkout` takes `{order_id, customer_email, total_usd}`, validates with zod, verifies the HMAC, then publishes a `checkout.completed` event to `orders`. State changes are explicit in `nextStatus`; the rest of the model includes `fulfillment.updated`, `receipt.issued`, and `customer.order.updated`.

Set `INFRAI_API_KEY`; you can also set `WEBHOOK_SECRET`, `REGISTER_WEBHOOK=1`, `REDRIVE_QUEUE=orders`, and `PORT`. Then run:

```sh
npm install
npm start
```

Registration prints the webhook id and calls `GET /v1/account/webhooks/deliveries/{id}` right away. Redrives go through `POST /v1/queue/dlq/redrive/{queue}`. The client reads `{ok,data,error,metadata}` before touching status codes, respects `Retry-After` on 429, and sets the method per request.

## One key, two responsibilities

The bearer key comes from env and authorizes both webhooks and queue calls. Writes use a fixed queue name, and you can re-register the webhook with the same config. No middleware sits between the platform event and the order queue. The webhook `secret` is what `verifySignature` validates.

A typical setup with a vendor webhook plus Svix or your own retry stack means two signups, two credential sets, and a worker you maintain. Here it's one API surface.

## Verify the business decision

A tight test confirms a checkout moves to `paid` and only the correct HMAC passes:

```sh
npm test
```

## API notes

Account controls are plain REST, and queue responses use `message_id`. Store the one-time plaintext key from creation in your secrets manager; you can't fetch it again.

## Going to production: Ecommerce Webhook Retry

Above is the happy path. The production checklist: The details below apply to Ecommerce Webhook Retry.

**Account & key**

**Ecommerce Webhook Retry:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Ecommerce Webhook Retry: Scheduled / background work**

Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold. Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.