# Server API pack - setup (one time, about 15 minutes)

What this adds: private-server owners who buy the **Server API** pack (Robux developer product `3717490507`, already
wired into the game) get a secret key in their server settings. With that key their Discord bot or website can
call `https://westbrookcounty.co.uk/api/v1/...` to run commands (`:h`, `:kick`, `:time` ...) and read players and logs
for **their own server only**.

How it fits together

    owner's bot --server-key--> Cloudflare Pages Functions (this repo) --Open Cloud--> MessagingService --> that one server
    that server --snapshots + logs (hidden URL)--> Cloudflare D1 <--reads-- owner's bot

Only the SHA-256 hash of each key is stored (in the game's private-server record and in D1). Everything is free-tier friendly.

## 1. Add the files to your repo
Copy the contents of this zip over your website repo (keep the folders), commit and push. New/changed files:

- `functions/_lib/serverApi.js`, `functions/_lib/serverApiLogs.js`, `functions/_lib/handlers/serverApiGame.js`
- `functions/api/v1/server.js` and `functions/api/v1/server/*.js` (public API)
- `functions/api/p/server-api/[token].js` and `functions/api/server-api/index.js` (game -> website)
- `pages/server-api.html` (public docs page), small nav-link edits in `index.html`, `pages/updates.html`, `pages/liveries.html`, and CSS at the end of `assets/css/styles.css`
- `server-api/schema.sql`, this guide, and `server-api/examples/`

## 2. Create the D1 database (stores key hashes, the latest server snapshot, recent logs)
1. Cloudflare dashboard > **Storage & Databases > D1 SQL database > Create database**. Name it `westbrook-server-api`.
2. Open it > **Console**, paste the whole of `server-api/schema.sql` and run it.
3. Go to **Workers & Pages > your Pages project > Settings > Bindings > Add > D1 database**.
   Variable name must be exactly `SERVER_API_DB`. Pick the database. Add it for **Production** (and Preview if you use it).

## 3. Roblox Open Cloud key (lets the website send commands to a server)
1. https://create.roblox.com/dashboard/credentials > **Create API Key**. Name it `Westbrook Server API`.
2. Access permissions: add **Messaging Service**, select the *Emergency: Westbrook County* experience, tick the
   **universe-messaging-service:publish** operation.
3. Leave the IP allow-list as `0.0.0.0/0` (Cloudflare's addresses change). Create it and copy the key once.
4. Cloudflare > your Pages project > **Settings > Variables and secrets > Add**: type **Secret**, name
   `ROBLOX_OPEN_CLOUD_KEY`, paste the key. (Optional: `ROBLOX_UNIVERSE_ID`; it defaults to `10650541219`.)

## 4. Redeploy
Push to GitHub (Pages redeploys) or **Deployments > Retry deployment** after adding the binding/secret. Bindings and secrets
only apply to new deployments.

## 5. Game side (already done in the place file - you just publish)
- The pack is in `ReplicatedStorage.ServerPacksConfig` as `serverApi`, product id `3717490507`. The shop text says
  "R$ 299"; **change that line to the real price you set on the developer product** so players aren't surprised.
- `Game Settings > Security > Allow HTTP Requests` must be ON (it already is for the livery/anti-cheat features).
- The game uses the same two secrets as the livery review: `westbrook_api_key` (= `ROBLOX_API_KEY` in Cloudflare) and
  `westbrook_api_path` (= `PRIVATE_API_PATH`), both for domain `westbrookcounty.co.uk`. If you already set them up for the livery
  system there is nothing more to do. Make sure they also exist in the Creator Hub secrets for the live game.
- Save and **Publish to Roblox** from Studio.

## 6. Try it
1. In a private server you own, run the dev command that grants all packs (or buy the pack with a real purchase).
2. Settings > scroll to **Server API Pack** > **Open** > **Generate key**. Copy it.
3. From any computer:

        curl https://westbrookcounty.co.uk/api/v1/server -H "server-key: YOUR_KEY"
        curl -X POST https://westbrookcounty.co.uk/api/v1/server/command \
             -H "server-key: YOUR_KEY" -H "Content-Type: application/json" \
             -d '{"command": ":h Hello from the API"}'

   The first call can answer `422` for up to a minute right after generating a key - the server posts its first report
   within about 5-30 seconds. The message appears in-game within a couple of seconds of the second call.

## Free-tier numbers
- Cloudflare Pages Functions: 100,000 requests/day (each API call is 1 request). D1: 5 million reads and 100,000 writes/day.
- A server only writes when something changed (or every ~4 minutes), reports every 15 s while someone is actively using
  the API and about once a minute otherwise, so ~20 busy servers fit inside the free write allowance.
- Roblox MessagingService: each server listens to its own private topic; limits are 1 KB per message and per-minute caps that
  a bot would not normally reach. Commands are limited to 10/minute per key (20 requests/10 s for reads).

## Troubleshooting
| Symptom | Cause |
|---|---|
| In-game "Couldn't reach the Westbrook API service (http_404)" | `westbrook_api_path` secret missing/wrong, or the files aren't deployed yet |
| ... `(http_401)` | `westbrook_api_key` doesn't equal `ROBLOX_API_KEY` |
| ... `(http_503)` | D1 binding `SERVER_API_DB` missing (redeploy after adding it) |
| API answers `503` "not set up" | same D1 binding problem |
| `POST /command` answers `503` "missing Open Cloud key" | `ROBLOX_OPEN_CLOUD_KEY` secret not set / not redeployed |
| `POST /command` answers `502` | the Open Cloud key lacks the messaging publish permission for this experience |
| Command sent but nothing happens | the game isn't published with the new version yet, or the server is on an old version |
| `422` "offline" | the reserved server isn't running or hasn't reported in 15 minutes |

## Notes / limits (be upfront with server owners)
- Commands are *queued*, not confirmed: the reply means the website sent it. Results show in `/server/commandlogs`.
- Roblox MessagingService is best-effort; very rarely a message can be lost. Owners can just resend.
- Settings changed by `:time`, `:weather`, `:peacetime`, `:priority`, `:set` are saved to the server's record like the in-game settings panel.
- Regenerating or revoking a key switches the old one off straight away (the game checks the key fingerprint inside every message).
- There is no way to recover a lost key; the owner just generates a new one.
