# Staff portal - setup (about 15 minutes, one time)

Page: `https://westbrookcounty.co.uk/pages/staff.html` (not linked anywhere on the site, and hidden from search engines).
Staff log in with Discord. Your Discord server's roles decide what each person can do. There are no passwords.

| Level | Who | Can do |
| --- | --- | --- |
| staff | Members with a role in `STAFF_ROLE_IDS` | Dashboard, announcements, LOA requests, clock in/out, their own tasks and strikes, the roster |
| manager | Members with a role in `MANAGER_ROLE_IDS` | Everything above, plus approve/deny LOA, post announcements, assign tasks, issue strikes, see weekly duty hours |
| admin | Members with a role in `ADMIN_ROLE_IDS`, or listed in `STAFF_ADMIN_USER_IDS` | Everything above, plus set ranks and notes, and the **admin page** (`/pages/staff-admin.html`): setup check, suspend members, end sessions, activity log, CSV exports, data tidy-up |

Everything is checked on the server for every request. Someone without the role gets nothing, even if they know the address.
No staff data is stored in this public repo: it lives in Cloudflare D1.

## 1. Create a separate database for staff data
Keep this apart from the Server API database.
1. Cloudflare dashboard > Storage & Databases > D1 SQL database > **Create database**. Name it `westbrook-staff`.
2. Open it > **Console**, paste the whole of `staff-portal/schema.sql` and run it. (If you ran it before, run it again after an update: every line is `IF NOT EXISTS`, so it only adds the new tables.)
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
