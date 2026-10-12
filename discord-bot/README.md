# Westbrook ticket bot (AI)

Answers simple questions in ticket channels from `knowledge/*.md`, and hands everything else
(bans, appeals, reports, purchases, anything it's unsure of) to staff with a short AI summary.
It stays silent once a staff member has spoken in the ticket, never pings @everyone, and only
links westbrookcounty.co.uk.

## Setup
1. **Cloudflare Pages** -> Settings -> Variables and Secrets: add `BOT_API_SECRET` (any long random string). Redeploy.
2. **Discord Developer Portal** -> New Application -> Bot -> Reset Token. Turn ON **Message Content Intent**.
3. Invite with scope `bot applications.commands` and permissions: View Channels, Send Messages, Read Message History.
4. Copy `.env.example` to `.env`, fill it in (same `BOT_API_SECRET`; role/category IDs via Developer Mode -> Copy ID).
5. `npm install` then `node --env-file=.env index.js` (Node 20+).
6. Edit `knowledge/*.md` - the bot only answers from these notes. Use `## Heading` per topic.

It must run on an always-on machine (VPS, home PC, Pi, free-tier VM; use pm2/systemd to keep it up).

## Commands
- `/ask question` - private answer anywhere.
- `/ticket-summary` - staff-only AI summary of the current ticket.
