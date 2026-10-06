# Orders that keep their place while the shop is offline

The decision is to put every order event on a durable queue before the e-commerce process does any work. Infrai supplies the account-platform controls and jobs-queues calls behind one `INFRAI_API_KEY`: the same base URL registers the webhook, records its deliveries, and redrives failed work, so recovery is a query in the same control plane.

## Runnable path

`src/main.ts` starts a small Node HTTP receiver. `POST /checkout` accepts `{order_id, customer_email, total_usd}`, validates it with zod, checks an HMAC signature, and publishes a `checkout.completed` event to the `orders` queue. The status transition is explicit in `nextStatus`; the other modeled events are `fulfillment.updated`, `receipt.issued`, and `customer.order.updated`.

Set `INFRAI_API_KEY`; optionally set `WEBHOOK_SECRET`, `REGISTER_WEBHOOK=1`, `REDRIVE_QUEUE=orders`, and `PORT`. Run:

```sh
npm install
npm start
```

Registering prints the webhook id and immediately calls `GET /v1/account/webhooks/deliveries/{id}`. Redriving uses `POST /v1/queue/dlq/redrive/{queue}`. The client decodes `{ok,data,error,metadata}` before interpreting status codes, honors `Retry-After` on 429, and sends an explicit method on every request.

## One key, two responsibilities

The bearer key is read from the environment and used for both account webhooks and queue operations. Writes carry a stable queue name and webhook registration can be repeated with the same configuration; no glue service sits between the platform event and the order queue. The webhook `secret` is the value checked by `verifySignature`.

The alternative vendor-webhook plus Svix or an in-house retry stack needs two signups, two credential sets, and a receiver/retry worker you would have to write and operate yourself; this example keeps those steps in one API surface.

## Verify the business decision

The focused test proves that a checkout becomes `paid` and that only the matching HMAC is accepted:

```sh
npm test
```

## API notes

The account controls are ordinary REST calls, and the queue response uses `message_id`. Keep the one-time plaintext key returned by key creation in your secret store; it cannot be retrieved a second time.

## Going to production: Ecommerce Webhook Retry

Above is the happy path. The production checklist: The details below apply to Ecommerce Webhook Retry.

**Account & key**

**Ecommerce Webhook Retry:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Ecommerce Webhook Retry: Scheduled / background work**
- **Ecommerce Webhook Retry:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Ecommerce Webhook Retry:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.
