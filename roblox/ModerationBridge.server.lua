--[[
	Westbrook County - Moderation Bridge          (a normal Script in ServerScriptService)

	What it does
	  1. Sends each player's profile (money, XP, vehicles, gamepasses, join dates ...) to the staff website.
	  2. Every 10 seconds picks up commands staff typed on the website (ban, unban, kick, warn, announce)
	     and carries them out in the game.
	  3. Reports bans the game made by itself, so they show up on the website too.

	Before you start
	  - Game Settings > Security > turn on "Allow HTTP Requests".
	  - You already have the two Roblox secrets from the livery / anti-cheat setup:
	      westbrook_api_key   (= ROBLOX_API_KEY in Cloudflare)
	  - Fill in the PRIVATE_PATH below (the same value as PRIVATE_API_PATH in Cloudflare).
	  - Only the "YOUR GAME" part near the top needs editing.

	Bans use Roblox's own ban system (Players:BanAsync), so they work across every server, even
	for players who are offline, and Roblox kicks the player for you.
]]

local Players = game:GetService("Players")
local HttpService = game:GetService("HttpService")
local DataStoreService = game:GetService("DataStoreService")
local MessagingService = game:GetService("MessagingService")
local MarketplaceService = game:GetService("MarketplaceService")
local RunService = game:GetService("RunService")

----------------------------------------------------------------------
-- YOUR GAME  (edit this part)
----------------------------------------------------------------------
local CONFIG = {
	-- The secret part of the web address (the same text as PRIVATE_API_PATH in Cloudflare).
	-- If you have not set PRIVATE_API_PATH in Cloudflare, leave this empty.
	PRIVATE_PATH = "",

	-- Gamepasses to show on a player's profile: { id = 123456, name = "Early Access" }
	GAMEPASSES = {
		-- { id = 0, name = "Early Access" },
	},

	-- Return what you know about a player. Anything you leave out is simply not shown.
	-- Example for a game that keeps money in leaderstats and XP in attributes:
	--   money = player.leaderstats.Cash.Value,
	--   xp = { police = player:GetAttribute("PoliceXP"), fire = player:GetAttribute("FireXP"), dot = player:GetAttribute("DOTXP") },
	--   vehicles = { "Ford Explorer", "Chevy Tahoe" },
	--   extra = { ["Helicopter Calls"] = 0, ["Early Access"] = "Yes" },   -- anything else you want staff to see
	getGameData = function(player)
		local data = {}
		local stats = player:FindFirstChild("leaderstats")
		if stats then
			local cash = stats:FindFirstChild("Cash") or stats:FindFirstChild("Money")
			if cash then data.money = cash.Value end
		end
		return data
	end,
}
----------------------------------------------------------------------
-- Nothing below needs editing
----------------------------------------------------------------------

local BASE = "https://westbrookcounty.co.uk/api/"
local URL = CONFIG.PRIVATE_PATH ~= "" and (BASE .. "p/moderation/" .. CONFIG.PRIVATE_PATH) or (BASE .. "moderation/game")
local TOPIC = "WestbrookModeration"
local seenStore = DataStoreService:GetDataStore("WestbrookModSeen")
local joinedAt = {}

local function call(body)
	local ok, res = pcall(function()
		return HttpService:RequestAsync({
			Url = URL,
			Method = "POST",
			Headers = {
				["Content-Type"] = "application/json",
				["Authorization"] = HttpService:GetSecret("westbrook_api_key"):AddPrefix("Bearer "),
			},
			Body = HttpService:JSONEncode(body),
		})
	end)
	if not ok then
		warn("[ModerationBridge] request failed:", res)
		return nil
	end
	if not res.Success then
		warn("[ModerationBridge] website said", res.StatusCode, res.Body)
		return nil
	end
	local decoded
	pcall(function() decoded = HttpService:JSONDecode(res.Body) end)
	return decoded
end

-- ---------------------------------------------------------------- profile
local function gamepassList(player)
	local owned = {}
	for _, pass in ipairs(CONFIG.GAMEPASSES) do
		local ok, has = pcall(function() return MarketplaceService:UserOwnsGamePassAsync(player.UserId, pass.id) end)
		if ok and has then table.insert(owned, pass.name) end
	end
	return owned
end

local function sendProfile(player, leaving)
	local now = os.time()
	local first, playtime = now, 0
	pcall(function()
		seenStore:UpdateAsync(tostring(player.UserId), function(old)
			old = old or { first = now, playtime = 0 }
			if leaving and joinedAt[player] then
				old.playtime = (old.playtime or 0) + (now - joinedAt[player])
				joinedAt[player] = now
			end
			first, playtime = old.first or now, old.playtime or 0
			return old
		end)
	end)
	local ok, data = pcall(CONFIG.getGameData, player)
	if not ok or type(data) ~= "table" then data = {} end
	call({
		action = "profile",
		player = {
			userId = player.UserId,
			username = player.Name,
			displayName = player.DisplayName,
			money = data.money,
			xp = data.xp,
			vehicles = data.vehicles,
			gamepasses = gamepassList(player),
			firstJoined = first,
			lastJoined = now,
			accountCreated = now - player.AccountAge * 86400,
			playtimeSeconds = playtime,
			extra = data.extra,
		},
	})
end

Players.PlayerAdded:Connect(function(player)
	joinedAt[player] = os.time()
	task.spawn(sendProfile, player, false)
end)
Players.PlayerRemoving:Connect(function(player)
	sendProfile(player, true)
	joinedAt[player] = nil
end)
for _, player in ipairs(Players:GetPlayers()) do
	joinedAt[player] = os.time()
	task.spawn(sendProfile, player, false)
end
task.spawn(function() -- keep money and XP fresh while people play
	while true do
		task.wait(300)
		for _, player in ipairs(Players:GetPlayers()) do
			sendProfile(player, false)
			task.wait(1)
		end
	end
end)

-- ---------------------------------------------------------------- messages shown on screen
local function showMessage(player, title, text)
	local gui = Instance.new("ScreenGui")
	gui.Name = "WestbrookModMessage"
	gui.ResetOnSpawn = false
	gui.DisplayOrder = 100
	local frame = Instance.new("Frame")
	frame.AnchorPoint = Vector2.new(0.5, 0)
	frame.Position = UDim2.fromScale(0.5, 0.08)
	frame.Size = UDim2.fromOffset(460, 110)
	frame.BackgroundColor3 = Color3.fromRGB(15, 18, 26)
	frame.BorderSizePixel = 0
	frame.Parent = gui
	Instance.new("UICorner", frame).CornerRadius = UDim.new(0, 10)
	local head = Instance.new("TextLabel")
	head.Size = UDim2.new(1, -20, 0, 28)
	head.Position = UDim2.fromOffset(10, 8)
	head.BackgroundTransparency = 1
	head.Font = Enum.Font.GothamBold
	head.TextSize = 20
	head.TextColor3 = Color3.fromRGB(255, 190, 40)
	head.TextXAlignment = Enum.TextXAlignment.Left
	head.Text = title
	head.Parent = frame
	local body = Instance.new("TextLabel")
	body.Size = UDim2.new(1, -20, 1, -44)
	body.Position = UDim2.fromOffset(10, 38)
	body.BackgroundTransparency = 1
	body.Font = Enum.Font.Gotham
	body.TextSize = 16
	body.TextWrapped = true
	body.TextColor3 = Color3.new(1, 1, 1)
	body.TextXAlignment = Enum.TextXAlignment.Left
	body.TextYAlignment = Enum.TextYAlignment.Top
	body.Text = text
	body.Parent = frame
	gui.Parent = player:FindFirstChildOfClass("PlayerGui")
	task.delay(12, function() gui:Destroy() end)
end

-- kick / warn / announce reach every server through MessagingService
local function runLocal(msg)
	if msg.type == "kick" then
		local p = Players:GetPlayerByUserId(msg.userId)
		if p then p:Kick(msg.reason ~= "" and msg.reason or "You were removed by staff.") end
	elseif msg.type == "warn" then
		local p = Players:GetPlayerByUserId(msg.userId)
		if p then showMessage(p, "Staff warning", msg.reason) end
	elseif msg.type == "announce" then
		for _, p in ipairs(Players:GetPlayers()) do showMessage(p, "Staff announcement", msg.reason) end
	end
end

pcall(function()
	MessagingService:SubscribeAsync(TOPIC, function(message) runLocal(message.Data) end)
end)

local function broadcast(cmd)
	local msg = { type = cmd.type, userId = cmd.userId, reason = string.sub(cmd.reason or "", 1, 300) }
	runLocal(msg)
	pcall(function() MessagingService:PublishAsync(TOPIC, msg) end)
end

-- ---------------------------------------------------------------- carry out website commands
local function execute(cmd)
	if cmd.type == "ban" then
		Players:BanAsync({
			UserIds = { cmd.userId },
			Duration = (cmd.durationSeconds and cmd.durationSeconds > 0) and cmd.durationSeconds or -1,
			DisplayReason = cmd.reason,
			PrivateReason = "Banned by " .. tostring(cmd.by) .. " from the staff website",
			ExcludeAltAccounts = false,
			ApplyToUniverse = true,
		})
		return "banned"
	elseif cmd.type == "unban" then
		Players:UnbanAsync({ UserIds = { cmd.userId }, ApplyToUniverse = true })
		return "unbanned"
	else
		broadcast(cmd)
		return "sent to all servers"
	end
end

local function poll()
	local reply = call({ action = "poll" })
	if not reply or not reply.commands then return end
	for _, cmd in ipairs(reply.commands) do
		local ok, result = pcall(execute, cmd)
		call({ action = "ack", id = cmd.id, ok = ok, result = tostring(result) })
	end
end

if not RunService:IsStudio() then
	task.spawn(function()
		while true do
			poll()
			task.wait(10)
		end
	end)
else
	print("[ModerationBridge] Studio detected: polling for staff commands is switched off here.")
end
