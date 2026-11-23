A relay from a made-up ticket tracker to floor: it checks the `X-Signature` HMAC, flattens the payload and posts `ticket.created` to `POST /events` with a `dedupeKey`.
Run it with Node 22: `RELAY_SECRET=... FLOOR_API_URL=... FLOOR_SERVICE_TOKEN=... node relay.mjs`.
Tutorial: https://re-cinq.github.io/floor/tutorials/ingest-third-party-events/
