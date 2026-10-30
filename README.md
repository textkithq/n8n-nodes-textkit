# n8n-nodes-textkit

n8n nodes for [TextKit](https://jointextkit.com), the SMS API for developers.
Send texts and verification codes from a workflow, and start a workflow when
one of your numbers gets a reply.

## Install

In n8n: **Settings > Community Nodes > Install**, enter `n8n-nodes-textkit`.

Self-hosted from the command line:

```bash
cd ~/.n8n/nodes && npm install n8n-nodes-textkit
```

Then restart n8n.

## Credentials

1. Create an API key in the [TextKit console](https://jointextkit.com/console) (API Keys page).
   A test key (`ssms_sk_test_...`) never texts real people; a live key does.
2. In n8n, add a **TextKit API** credential and paste the key. n8n checks it
   with `GET /v1/messages?limit=1`.

Leave **Base URL** at `https://api.jointextkit.com/v1`.

## Nodes

### TextKit

| Resource | Operation | API call |
| --- | --- | --- |
| Message | Send | `POST /v1/messages` (to, message; optional from, category, scheduled at, tags) |
| Message | Get | `GET /v1/messages/{id}` |
| Message | Get Many | `GET /v1/messages` (filters: direction, status, to, from, number, tag, created after/before; follows `next_cursor`) |
| Verification | Send Code | `POST /v1/verify` (SMS or email; optional app name, from, user IP) |
| Verification | Check Code | `POST /v1/verify/check` |

The node can also be used as a tool by n8n's AI Agent.

### TextKit Trigger

Starts the workflow on **Message Received** (`message.received`).

- On activation it creates a TextKit webhook endpoint for the workflow's URL
  (`POST /v1/webhooks`, events `["message.received"]`, optionally limited to
  some of your numbers). On deactivation it deletes it.
- Every request is checked against the endpoint's signing secret
  (`textkit-signature`, HMAC-SHA256 over `t.rawBody`, 5-minute tolerance).
  A bad signature gets 401 and runs nothing.
- Output: `message_id`, `from`, `to`, `body`, `conversation`, `simulated`,
  plus `event_id`, `mode` and `created_at`.
- Turn on **Ignore Simulated Messages** in production to skip inbound
  messages a test key simulated.

An account has at most 5 webhook endpoints, and each active workflow with this
trigger uses one.

## Try it in the sandbox

With a test key, send to `+15005550006`: the message always ends `delivered`.
Simulate a reply with `POST /v1/test/inbound` to fire the trigger.

## Development

```bash
npm install --ignore-scripts
npm test        # tsc build + unit tests against dist/
npm run lint    # n8n's community-node lint (@n8n/node-cli)
npm run dev     # local n8n with this package loaded
```

## Links

- [TextKit API docs](https://jointextkit.com/docs/quickstart)
- [Webhooks and signatures](https://jointextkit.com/docs/webhooks)
- [n8n community nodes](https://docs.n8n.io/integrations/community-nodes/)

## License

MIT
