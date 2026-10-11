--[[
	ModerationBridge  (a Script in ServerScriptService)  - connects the game to the staff website's Moderation page.

	  1. Sends each player's profile to the website: money, Police / Fire / DOT XP, owned vehicles,
	     gamepasses, first + last joined, time played and more.
	  2. Every 10 seconds picks up commands staff typed on the website (ban, unban, kick, warn, announce)
	     and carries them out. Bans are written to the SAME ban list as your :ban command ("AdminBanList"),
	     so everything stays in one place.
	  3. Does nothing in Studio, so test sessions never take real staff commands.

	It uses WestbrookAPI (same secrets as the livery + anti-cheat) and your existing systems.
	Bans made in-game with :ban / :unban are reported by Adminhandler, anti-cheat bans by WestbrookAPI.
]]

local Players = game:GetService("Players")
local RS = game:GetService("ReplicatedStorage")
local SSS = game:GetService("ServerScriptService")
local DataStoreService = game:GetService("DataStoreService")
local MessagingService = game:GetService("MessagingService")
local RunService = game:GetService("RunService")

if RunService:IsStudio() then
	print("[ModerationBridge] Studio: switched off here so test sessions don't take real staff commands.")
	return
end

local WestbrookAPI = require(SSS:WaitForChild("WestbrookAPI"))
local GameStaffConfig = require(RS:WaitForChild("GameStaffConfig"))

local PATH = "/moderation/game"
local TOPIC = "WestbrookModeration"
local seenStore = DataStoreService:GetDataStore("WestbrookModSeen")
local banStore = DataStoreService:GetDataStore("AdminBanList") -- the same list Adminhandler uses
local BAN_INDEX_KEY = "BanIndex"
local joinedAt = {}

local function call(body)
	local data, err = WestbrookAPI.post(PATH, body)
	if not data then
		warn("[ModerationBridge] " .. tostring(body.action) .. " failed: " .. tostring(err))
	end
	return data
end

local function lazy(getter)
	local ok, result = pcall(getter)
	return ok and result or nil
end

-- ---------------------------------------------------------------- what the website shows about a player
local POOLS = { police = "PoliceSheriff", fire = "Fire", dot = "DOT" }

local function collect(player)
	local data = { extra = {} }

	-- money: Wallet + Bank (leaderstats)
	local stats = player:FindFirstChild("leaderstats") or player:FindFirstChild("Leaderstats")
	local wallet = stats and stats:FindFirstChild("Wallet")
	local bank = stats and stats:FindFirstChild("Bank")
	if wallet or bank then
		data.money = (wallet and wallet.Value or 0) + (bank and bank.Value or 0)
		data.extra["Wallet"] = wallet and ("$" .. wallet.Value) or nil
		data.extra["Bank"] = bank and ("$" .. bank.Value) or nil
	end

	-- XP and rank per department
	local RankXP = lazy(function() return require(RS.framework.Systems["Rank & XP System"].Core.Server) end)
	if RankXP then
		data.xp = {}
		local ranks = {}
		for key, pool in pairs(POOLS) do
			local okXp, xp = pcall(RankXP.getPlayerPoolXP, player, pool)
			data.xp[key] = okXp and xp or 0
			local okRank, rank = pcall(RankXP.getPlayerRank, player, pool)
			if okRank and rank and (data.xp[key] or 0) > 0 then
				ranks[key == "police" and "Police" or key == "fire" and "Fire" or "DOT"] = rank
			end
		end
		if next(ranks) then data.extra["Department ranks"] = ranks end
	end

	-- owned vehicles
	local VS = lazy(function() return require(RS.framework.Systems["Vehicle Spawner"].Core.Server) end)
	if VS and VS.getOwnedVehicleNames then
		local ok, names = pcall(VS.getOwnedVehicleNames, player)
		if ok then data.vehicles = names end
	end

	-- gamepasses (real or gifted) from PassConfig
	local PassService = lazy(function() return require(SSS.PassService) end)
	local PassConfig = lazy(function() return require(RS.PassConfig) end)
	if PassService and PassConfig then
		local owned = {}
		for key, entry in pairs(PassConfig) do
			if type(entry) == "table" and entry.gamepassId and entry.gamepassId ~= 0 then
				local ok, has = pcall(PassService.Owns, player, key)
				if ok and has then table.insert(owned, tostring(entry.name or entry.displayName or key)) end
			end
		end
		table.sort(owned)
		data.gamepasses = owned
	end

	if player.Team then data.extra["Team right now"] = player.Team.Name end
	return data
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
	local ok, data = pcall(collect, player)
	if not ok then data = {} end
	call({
		action = "profile",
		player = {
			userId = player.UserId,
			username = player.Name,
			displayName = player.DisplayName,
			money = data.money,
			xp = data.xp,
			vehicles = data.vehicles,
			gamepasses = data.gamepasses,
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
	task.delay(20, function() -- give XP / vehicles time to load first
		if player.Parent then sendProfile(player, false) end
	end)
end)
Players.PlayerRemoving:Connect(function(player)
	task.spawn(function()
		sendProfile(player, true)
		joinedAt[player] = nil
	end)
end)
for _, player in ipairs(Players:GetPlayers()) do
	joinedAt[player] = os.time()
	task.delay(20, function() if player.Parent then sendProfile(player, false) end end)
end
task.spawn(function() -- keep money and XP fresh while people play
	while true do
		task.wait(300)
		for _, player in ipairs(Players:GetPlayers()) do
			sendProfile(player, false)
			task.wait(2)
		end
	end
end)

-- Tell the website about bans that already existed before this script, so Look up shows them.
task.delay(45, function()
	local ok, index = pcall(function() return banStore:GetAsync(BAN_INDEX_KEY) end)
	if not ok or type(index) ~= "table" then return end
	local batch = {}
	local function flush()
		if #batch > 0 then call({ action = "syncBans", bans = batch }) end
		batch = {}
	end
	for key, entry in pairs(index) do
		if type(entry) == "table" and tonumber(key) then
			table.insert(batch, {
				userId = tonumber(key), username = entry.username, reason = entry.reason,
				by = entry.bannedBy, timestamp = entry.timestamp, expires = entry.expires,
			})
			if #batch >= 100 then flush() task.wait(1) end
		end
	end
	flush()
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

local function broadcast(type_, userId, reason)
	local msg = { type = type_, userId = userId, reason = string.sub(reason or "", 1, 300) }
	runLocal(msg)
	pcall(function() MessagingService:PublishAsync(TOPIC, msg) end)
end

-- ---------------------------------------------------------------- carry out website commands
local function execute(cmd)
	if (cmd.type == "ban" or cmd.type == "kick") and GameStaffConfig.IsGameStaff(cmd.userId) then
		error("that player is game staff and is protected")
	end
	if cmd.type == "ban" then
		local now = os.time()
		local expires = (cmd.durationSeconds and cmd.durationSeconds > 0) and (now + cmd.durationSeconds) or nil
		local key = tostring(cmd.userId)
		banStore:UpdateAsync(BAN_INDEX_KEY, function(old)
			old = old or {}
			old[key] = {
				reason = cmd.reason,
				date = os.date("%Y-%m-%d %H:%M"),
				timestamp = now,
				bannedBy = tostring(cmd.by) .. " (website)",
				username = cmd.username ~= "" and cmd.username or nil,
				expires = expires, -- Adminhandler lifts the ban after this time
			}
			return old
		end)
		broadcast("kick", cmd.userId, "You are banned from this game.\nReason: " .. tostring(cmd.reason))
		return "banned"
	elseif cmd.type == "unban" then
		local key = tostring(cmd.userId)
		banStore:UpdateAsync(BAN_INDEX_KEY, function(old)
			old = old or {}
			old[key] = nil
			return old
		end)
		return "unbanned"
	else
		broadcast(cmd.type, cmd.userId, cmd.reason)
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

task.spawn(function()
	while true do
		poll()
		task.wait(10)
	end
end)

print("[ModerationBridge] running")
