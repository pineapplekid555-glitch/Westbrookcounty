# Staff portal - setup (about 15 minutes, one time)

Page: `https://westbrookcounty.co.uk/pages/staff.html` (not linked anywhere on the site, and hidden from search engines).
Staff log in with Discord. Your Discord server's roles decide what each person can do. There are no passwords.

| Level | Who | Can do |
| --- | --- | --- |
| staff | Members with a role in `STAFF_ROLE_IDS` | Dashboard, announcements, LOA requests, clock in/out, their own tasks and strikes, the roster |
| manager | Members with a role in `MANAGER_ROLE_IDS` | Everything above, plus approve/deny LOA, post announcements, assign tasks, see weekly duty hours |
| admin | Members with a role in `ADMIN_ROLE_IDS`, or listed in `STAFF_ADMIN_USER_IDS` | Everything above, plus set ranks and notes, and the **admin page** (`/pages/staff-admin.html`): setup check, suspend members, **strikes**, **tasks** (admin tasks can't be deleted by managers), end sessions, **activity log**, CSV exports, data tidy-up. Staff can see their own strikes (read-only) in the portal |

Everything is checked on the server for every request. Someone without the role gets nothing, even if they know the address.
No staff data is stored in this public repo: it lives in Cloudflare D1.

## 1. Create a separate database for staff data
Keep this apart from the Server API database.
1. Cloudflare dashboard > Storage & Databases > D1 SQL database > **Create database**. Name it `westbrook-staff`.
2. Open it > **Console**, paste the whole of `staff-portal/schema.sql` and run it. (If you ran it before, run it again after an update: every line is `IF NOT EXISTS`, so it only adds the new tables. If you already created `staff_tasks` earlier, also run once: `ALTER TABLE staff_tasks ADD COLUMN admin_locked INTEGER NOT NULL DEFAULT 0;`)
3. Go to Workers & Pages > your Pages project > Settings > Bindings > **Add > D1 database**. The variable name must be exactly `STAFF_DB`. Pick `westbrook-staff`. Add it for Production.

(`STAFF_DB` is used whenever it exists. Only if it is missing does the portal fall back to the `SERVER_API_DB` binding, which you do not want.)

## 2. Discord application (free, no bot needed)
1. https://discord.com/developers/applications > **New Application** > name it "Westbrook Staff Portal".
2. **OAuth2** in the left menu. Copy the **Client ID**. Press **Reset Secret** and copy the **Client Secret** (shown once).
3. Under **Redirects** press **Add Redirect** and enter exactly `https://westbrookcounty.co.uk/api/staff/callback`, then **Save Changes**.

## 3. Collect the Discord ids
In Discord: User Settings > Advanced > turn on **Developer Mode**. Then right-click to **Copy ID**:
- your staff server (its icon) = Server id
- each staff role (Server Settings > Roles > right-click a role) = Role ids
- yourself (your name in a message) = your user id

## 4. Cloudflare settings
Workers & Pages > your project > Settings > Variables and secrets > Add (then redeploy):

| Name | Type | Value |
| --- | --- | --- |
| `DISCORD_CLIENT_ID` | Text | the Client ID |
| `DISCORD_CLIENT_SECRET` | **Secret** | the Client Secret |
| `DISCORD_GUILD_ID` | Text | the server id |
| `STAFF_ROLE_IDS` | Text | role ids that count as staff, separated by commas |
| `MANAGER_ROLE_IDS` | Text | role ids for managers |
| `ADMIN_ROLE_IDS` | Text | role ids for admins |
| `STAFF_ADMIN_USER_IDS` | Text | your own user id (makes sure you can always get in as admin) |
| `STAFF_ANNOUNCE_WEBHOOK` | Secret, optional | a Discord channel webhook URL, to post announcements to Discord |
| `STAFF_CHAT_CHANNEL_ID` | Text, optional | the staff chat channel id (instead of a webhook; needs `DISCORD_BOT_TOKEN`) |
| `DISCORD_BOT_TOKEN` | **Secret**, optional | a bot token for a bot that is in your server and can send messages in that channel |

A channel id on its own cannot post anything. Either use a webhook (simplest: Channel settings > Integrations > Webhooks), or a bot token plus the channel id.

Roles are cumulative: put the manager and admin role ids in their own variables; you do not need to repeat them in `STAFF_ROLE_IDS`.

## 5. Try it
Open `/pages/staff.html`, press **Log in with Discord**, approve, and you should land in the portal.

## Good to know
- A login lasts 8 hours. Role changes in Discord take effect the next time someone logs in.
- To remove someone straight away: take their Discord role, then run in the D1 console
  `DELETE FROM staff_sessions WHERE discord_id = 'THEIR_DISCORD_ID';`
- Discord login only works on the real domain (the redirect address above). Preview deployments will say the redirect is invalid.
- Staff appear in the roster the first time they log in.

## Moderation (look-ups, bans, anti-cheat bans on the website)
Page: `/pages/staff-mod.html` (linked from the portal). Everyone on staff can **look players up** and **see anti-cheat bans**.
Who can **ban, unban, kick, warn and message all servers** is set with the Cloudflare variable `MOD_ACTION_LEVEL`
(`1` = all staff, `2` = managers and admins - the default, `3` = admins only).

1. Run `staff-portal/schema.sql` again in the D1 console (adds the `mod_*` tables; safe to re-run).
2. Optional Cloudflare variable `MOD_PROTECTED_USER_IDS`: Roblox user ids (comma separated) that can never be banned or kicked from the website, e.g. the owner.
3. In Roblox Studio, put `roblox/ModerationBridge.server.lua` in a **Script** in ServerScriptService. Edit the "YOUR GAME" part at the top
   (money, XP, vehicles and gamepasses). Turn on Game Settings > Security > Allow HTTP Requests. It uses the `westbrook_api_key` secret you already have.
   Paste your `PRIVATE_API_PATH` value into `PRIVATE_PATH` (leave it empty if you never set `PRIVATE_API_PATH`).
4. Publish the game. Players appear on the Look up tab after they join.

Anti-cheat bans (from the existing anti-cheat report) show up automatically on the **Anti-cheat bans** tab with the AI's second opinion.
Website commands reach the game within about 5 to 10 seconds (every 5 seconds while staff have the Moderation page open, otherwise every 20) and the **Activity** tab shows whether the game carried them out.

**Admins only** (whatever `MOD_ACTION_LEVEL` is): on a player's profile, give or take XP, money and vehicles. Online players change instantly; offline players are changed in their saved data (offline money can only be given if the player already has a saved balance). The vehicle list comes from the game about 30 seconds after a server starts, so re-publish the game with the new Vehicle Spawner functions (`giveOwnedVehicle`, `getAllVehicleNames`) before using "Give vehicle".

The Moderation page refreshes itself every 8 seconds. While a profile is open the game sends fresh money and XP for that player straight away (no more than once every 5 seconds), so the numbers stay live without extra load.

Anti-cheat auto-bans: if the game reports the same player several times, only the first within 15 minutes is logged, reviewed and sent to Discord.
Bans use Roblox's own ban system, so they work in every server and for offline players.

Anti-cheat detail: every flag now carries the situation the game recorded (team, ping, position, humanoid state, vehicle numbers and so on). It appears in the ban's notes on the Moderation page, in the Discord alert, and is given to the AI review, which now follows a stricter checklist and returns the key evidence and what it is unsure about. "Vehicle Speed Exploit" flags a driver averaging more than 10 mph above that vehicle's own top speed; it only flags by default (set `VEHICLE_SPEED_CAN_BAN = true` in the game's Adminhandler to let repeats ban).

Account checks and alts: a profile now shows the public Roblox account age, creation date, friends, followers, following and groups (cached for an hour). "Check with AI" gives a likely-bot and likely-alt percentage with reasons (it needs an AI provider, such as the Workers AI binding `AI`; without one it shows a simple rule-based estimate). Managers and above (whatever `MOD_ACTION_LEVEL` is) can link an account as an alt of a main account. Once linked, banning any account in the group, by hand, in game or by the anti-cheat, bans the others too, with the same length, unless they are in `MOD_PROTECTED_USER_IDS`. Unbanning only unbans the account you pick. The `mod_links` table is added automatically; `schema.sql` also creates it.
