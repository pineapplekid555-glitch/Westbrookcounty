// Minimal Discord bot for one Westbrook County private server (discord.js v14, Node 18+).
//   npm i discord.js
//   DISCORD_TOKEN=... APP_ID=... GUILD_ID=... SERVER_KEY=wbk_... node discord-bot.js
// Slash commands: /players  /server  /cmd command:":h Hello"
// Tip: restrict /cmd to your staff role in Discord (Server Settings > Integrations).
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require("discord.js");

const BASE = "https://westbrookcounty.co.uk/api/v1";
const api = (path, options = {}) =>
  fetch(BASE + path, { ...options, headers: { "server-key": process.env.SERVER_KEY, "Content-Type": "application/json" } })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

const commands = [
  new SlashCommandBuilder().setName("players").setDescription("Who is in the server"),
  new SlashCommandBuilder().setName("server").setDescription("Server info"),
  new SlashCommandBuilder().setName("cmd").setDescription("Run an in-game command")
    .addStringOption((o) => o.setName("command").setDescription(':h Hello').setRequired(true)),
].map((c) => c.toJSON());

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async () => {
  await new REST().setToken(process.env.DISCORD_TOKEN)
    .put(Routes.applicationGuildCommands(process.env.APP_ID, process.env.GUILD_ID), { body: commands });
  console.log("Ready");
});

client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;
  await i.deferReply();
  if (i.commandName === "players") {
    const r = await api("/server/players");
    if (r.status !== 200) return i.editReply(`Error ${r.status}: ${r.body.message}`);
    const list = r.body.map((p) => `${p.Name} (${p.Team})`).join("\n") || "Nobody is online.";
    return i.editReply(`**${r.body.length} player(s)**\n${list}`.slice(0, 1900));
  }
  if (i.commandName === "server") {
    const r = await api("/server");
    if (r.status !== 200) return i.editReply(`Error ${r.status}: ${r.body.message}`);
    return i.editReply(`**${r.body.Name}** - ${r.body.CurrentPlayers}/${r.body.MaxPlayers} players - join code \`${r.body.JoinKey}\``);
  }
  if (i.commandName === "cmd") {
    const r = await api("/server/command", { method: "POST", body: JSON.stringify({ command: i.options.getString("command") }) });
    return i.editReply(r.status === 200 ? "Sent." : `Error ${r.status}: ${r.body.message}`);
  }
});

client.login(process.env.DISCORD_TOKEN);
