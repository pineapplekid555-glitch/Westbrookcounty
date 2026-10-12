import { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadKnowledge, search } from "./lib/knowledge.js";
import { isTicketChannel, staffActive, decide } from "./lib/ticket.js";
import { ask } from "./lib/api.js";

const env = process.env;
const list = (s) => (s || "").split(",").map((x) => x.trim()).filter(Boolean);
const cfg = {
  token: env.DISCORD_TOKEN, guildId: env.GUILD_ID, siteUrl: env.SITE_URL || "https://westbrookcounty.co.uk",
  secret: env.BOT_API_SECRET, staffRoles: list(env.STAFF_ROLE_IDS), pingRole: env.STAFF_PING_ROLE_ID,
  categoryIds: list(env.TICKET_CATEGORY_IDS), prefixes: env.TICKET_PREFIXES === undefined ? ["ticket-"] : list(env.TICKET_PREFIXES),
  logChannel: env.LOG_CHANNEL_ID, maxReplies: Number(env.MAX_AUTO_REPLIES) || 3
};
if (!cfg.token || !cfg.secret || !cfg.guildId) { console.error("Set DISCORD_TOKEN, GUILD_ID and BOT_API_SECRET (see .env.example)."); process.exit(1); }

const kb = loadKnowledge(join(dirname(fileURLToPath(import.meta.url)), "knowledge"));
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel]
});
const NO_MENTIONS = { parse: [] };
const timers = new Map();
const isStaff = (m) => !!m && cfg.staffRoles.some((r) => m.roles?.cache?.has(r));
const TAG = "\n-# AI answer - staff will double-check if it's wrong.";

async function history(channel) {
  const msgs = [...(await channel.messages.fetch({ limit: 20 })).values()]; // newest first
  return msgs.map((m) => ({ authorBot: m.author.bot, isStaff: isStaff(m.member), role: isStaff(m.member) ? "staff" : "user", text: m.content, bot: m.author.id === client.user.id }));
}

async function handle(channel, authorId) {
  const msgs = await history(channel);
  if (staffActive(msgs)) return;
  const chrono = msgs.slice().reverse().filter((m) => m.text);
  const last = [...msgs].find((m) => !m.authorBot);
  if (!last) return;
  if (msgs.some((m) => m.bot && m.text.includes("passed this to our staff"))) return; // already handed off
  const botReplies = msgs.filter((m) => m.bot && m.text.endsWith("wrong.")).length;
  const hist = chrono.filter((m) => !(m.bot)).slice(-8).map((m) => ({ role: m.role, text: m.text }));
  const ai = await ask(cfg, { mode: "answer", question: last.text, history: hist, knowledge: search(kb, last.text + " " + hist.map((h) => h.text).join(" ")) });
  const action = decide({ text: last.text, botReplies, maxReplies: cfg.maxReplies, ai });
  if (action === "answer") {
    await channel.send({ content: ai.answer + TAG, allowedMentions: NO_MENTIONS });
  } else {
    const sum = await ask(cfg, { mode: "summary", question: last.text, history: hist, knowledge: [] });
    const ping = cfg.pingRole ? `<@&${cfg.pingRole}> ` : "";
    await channel.send({
      content: `Thanks - I've passed this to our staff team and someone will be with you as soon as they can.` + (sum.ok && sum.summary ? `\n-# Summary for staff: ${sum.summary} (${sum.category})` : ""),
      allowedMentions: cfg.pingRole ? { roles: [cfg.pingRole] } : NO_MENTIONS
    });
    if (ping) await channel.send({ content: ping + "ticket needs a human.", allowedMentions: { roles: [cfg.pingRole] } }).catch(() => {});
  }
  if (cfg.logChannel) {
    const lc = await client.channels.fetch(cfg.logChannel).catch(() => null);
    lc?.send({ content: `**${channel.name}** - ${action}: ${(ai.answer || ai.summary || "").slice(0, 300)}`, allowedMentions: NO_MENTIONS }).catch(() => {});
  }
}

client.on("messageCreate", (msg) => {
  if (msg.author.bot || !msg.guild || msg.guild.id !== cfg.guildId) return;
  if (!isTicketChannel(msg.channel, cfg) || isStaff(msg.member)) return;
  clearTimeout(timers.get(msg.channel.id));
  timers.set(msg.channel.id, setTimeout(() => handle(msg.channel).catch((e) => console.error(e)), 4000));
});

client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;
  try {
    if (i.commandName === "ask") {
      await i.deferReply({ ephemeral: true });
      const q = i.options.getString("question", true);
      const ai = await ask(cfg, { mode: "answer", question: q, knowledge: search(kb, q) });
      await i.editReply({ content: ai.ok && ai.answer ? ai.answer + (ai.needsHuman ? "\n-# Not sure about this one - please open a ticket." : "") : "Sorry, I couldn't answer that - please open a ticket.", allowedMentions: NO_MENTIONS });
    } else if (i.commandName === "ticket-summary") {
      await i.deferReply({ ephemeral: true });
      const msgs = (await i.channel.messages.fetch({ limit: 30 })).values();
      const text = [...msgs].reverse().filter((m) => !m.author.bot).map((m) => `${m.author.username}: ${m.content}`).join("\n").slice(-1500);
      const ai = await ask(cfg, { mode: "summary", question: text || "(empty)", knowledge: [] });
      await i.editReply({ content: ai.ok ? `${ai.summary || "No summary."} (${ai.category})` : "Couldn't summarise.", allowedMentions: NO_MENTIONS });
    }
  } catch (e) { console.error(e); }
});

client.once("ready", async () => {
  const cmds = [
    new SlashCommandBuilder().setName("ask").setDescription("Ask the Westbrook County assistant a question").addStringOption((o) => o.setName("question").setDescription("Your question").setRequired(true).setMaxLength(500)),
    new SlashCommandBuilder().setName("ticket-summary").setDescription("Staff: AI summary of this ticket").setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  ].map((c) => c.toJSON());
  await new REST({ version: "10" }).setToken(cfg.token).put(Routes.applicationGuildCommands(client.user.id, cfg.guildId), { body: cmds });
  console.log("Ready as", client.user.tag, "-", kb.length, "knowledge chunks");
});

client.login(cfg.token);
