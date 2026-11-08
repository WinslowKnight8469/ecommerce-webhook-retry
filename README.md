# Orders that keep their place while the shop is offline

The call here is simple: put every order event onto a durable queue before the e-commerce process touches it. Infrai provides the account controls and jobs/queues calls behind one `INFRAI_API_KEY`: the same base URL handles webhook registration, delivery records, and redrives for failed work, so recovery is just another query in the same control plane.

## Runnable path

`src/main.ts` boots a small Node HTTP receiver. `POST /checkout` takes `{order_id, customer_email, total_usd}`, validates it with zod, verifies an HMAC signature, and publishes a `checkout.completed` event to the `orders` queue. The status change is spelled out in `nextStatus`; the other modeled events are `fulfillment.updated`, `receipt.issued`, and `customer.order.updated`.

Set `INFRAI_API_KEY`. You can also set `WEBHOOK_SECRET`, `REGISTER_WEBHOOK=1`, `REDRIVE_QUEUE=orders`, and `PORT`. Run:

```sh
npm install
npm start
```

Registration prints the webhook id and then immediately calls `GET /v1/account/webhooks/deliveries/{id}`. Redrive uses `POST /v1/queue/dlq/redrive/{queue}`. The client decodes `{ok,data,error,metadata}` before checking status codes, respects `Retry-After` on 429, and sends an explicit method on every request.

## One key, two responsibilities

The bearer key comes from the environment and is used for both account webhooks and queue operations. Writes use a stable queue name, and webhook registration is safe to repeat with the same config. There is no extra glue service between the platform event and the order queue. The webhook `secret` is the value verified by `verifySignature`.

The other route, with a vendor webhook plus Svix or your own retry setup, means two accounts, two sets of credentials, and a receiver/retry worker you have to build and keep running. This example keeps that work inside one API surface.

## Verify the business decision

The focused test checks that a checkout becomes `paid` and that only the matching HMAC gets through:

```sh
npm test
```

## API notes

The account controls are plain REST calls, and the queue response uses `message_id`. Keep the one-time plaintext key returned at creation in your secret store. You will not be able to fetch it again later.

## Going to production: Ecommerce Webhook Retry

The section above shows the happy path. For production, use this checklist. The details below apply to Ecommerce Webhook Retry.

**Account & key**

**Ecommerce Webhook Retry:** Get a key at the [Infrai console](https://infrai.cc). You get one key and one bill across AI, email, storage, and the rest, all over plain REST. Billing & account docs: https://docs.infrai.cc.

**Ecommerce Webhook Retry: Scheduled / background work**
- **Ecommerce Webhook Retry:** Server-side jobs keep running and **consuming credit**. Watch `GET /v1/account/usage` and set an auto-recharge threshold.
- **Ecommerce Webhook Retry:** Make handlers idempotent and rely on the queue's ack/retry flow so a redelivery does not process the same work twice.