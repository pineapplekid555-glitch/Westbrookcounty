// Moderation page: look players up, ban / unban / kick / warn, review anti-cheat bans.
// The server checks your level on every request. Everything is shown as text.
(function () {
    "use strict";
    var SP = window.SP, $ = SP.$, h = SP.h, clear = SP.clear, api = SP.api, busy = SP.busy, say = SP.say, when = SP.when;
    var me = null, canAct = false, catalog = [], curTab = "look", curProfile = null, REFRESH_MS = 8000;

    SP.onUnauthorized = function () { if (me) { me = null; $("sp-app").hidden = true; $("sp-login").hidden = false; say("Your session ended. Please log in again.", "err"); } };
    function fail(e) { say(e.message, "err"); }
    function empty(t) { return h("div", { class: "sp-empty", text: t }); }
    function money(n) { return n == null ? "unknown" : "$" + Number(n).toLocaleString("en-GB"); }
    function num(n) { return n == null ? "unknown" : Number(n).toLocaleString("en-GB"); }
    function dur(sec) {
        if (sec == null) return "unknown";
        var d = Math.floor(sec / 86400), hh = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
        return (d ? d + "d " : "") + hh + "h " + m + "m";
    }
    function length(a) { return a.durationSecs ? Math.round(a.durationSecs / 86400) + " day(s)" : "permanent"; }

    function start() {
        var err = new URLSearchParams(location.search).get("e");
        if (err) { say(SP.LOGIN_ERRORS[err] || "Login failed.", "err"); history.replaceState(null, "", location.pathname); }
        api("/api/staff/me").then(function (d) {
            me = d;
            $("sp-login").hidden = true; $("sp-app").hidden = false;
            clear($("sp-av")).appendChild(SP.avatar(d.id, d.avatar));
            $("sp-name").textContent = d.name;
            $("sp-level").textContent = d.levelName; $("sp-level").className = "sp-badge " + d.levelName;
            $("sp-admin-link").hidden = d.level < 3;
            var q = new URLSearchParams(location.search).get("id");
            openTab("look");
            if (q && /^\d+$/.test(q)) openProfile(q);
        }).catch(function () { $("sp-login").hidden = false; });
    }

    var TABS = ["look", "auto", "bans", "act", "log"];
    function openTab(n) {
        Array.prototype.forEach.call(document.querySelectorAll(".sp-tabs button"), function (b) { b.setAttribute("aria-selected", b.getAttribute("data-tab") === n ? "true" : "false"); });
        curTab = n;
        TABS.forEach(function (t) { $("tab-" + t).hidden = t !== n; });
        ({ look: function () {}, auto: loadAuto, bans: loadBans, act: loadAct, log: loadLog })[n]();
    }
    Array.prototype.forEach.call(document.querySelectorAll(".sp-tabs button"), function (b) {
        b.addEventListener("click", function () { openTab(b.getAttribute("data-tab")); });
    });

    // ---- look up
    function search() {
        var q = $("q").value.trim();
        if (!q) return;
        api("/api/staff/mod/lookup?q=" + encodeURIComponent(q)).then(function (d) {
            canAct = d.canAct;
            var box = clear($("q-res"));
            if (!d.results.length) {
                box.appendChild(empty("Nobody with that name has joined yet."));
                if (/^\d+$/.test(q)) openProfile(q);
                else box.appendChild(h("button", { type: "button", class: "sp-link", text: "Try it as a Roblox username", onclick: function () { openProfileByName(q); } }));
                return;
            }
            d.results.forEach(function (r) {
                box.appendChild(h("button", { type: "button", class: "sp-res", onclick: function () { openProfile(r.userId); } },
                    h("strong", { text: r.displayName || r.username }), h("span", { class: "sp-meta", text: " @" + r.username + " · " + r.userId + (r.lastJoined ? " · last joined " + when(r.lastJoined) : "") })));
            });
        }).catch(fail);
    }
    function openProfileByName(name) {
        // a username we have never seen: ask the server to find the id (it asks Roblox)
        api("/api/staff/mod/resolve?q=" + encodeURIComponent(name)).then(function (d) { openProfile(d.userId); }).catch(fail);
    }
    $("q-go").addEventListener("click", search);
    $("q").addEventListener("keydown", function (e) { if (e.key === "Enter") search(); });

    function stat(k, v) { return h("div", { class: "sp-stat" }, h("div", { class: "k", text: k }), h("div", { class: "v", text: v })); }
    function extraList(value) {
        if (Array.isArray(value)) return h("ul", null, value.map(function (v) { return h("li", { text: String(v) }); }));
        if (value && typeof value === "object") return h("ul", null, Object.keys(value).map(function (k) { return h("li", null, h("strong", { text: k + ": " }), typeof value[k] === "object" ? extraList(value[k]) : document.createTextNode(String(value[k]))); }));
        return document.createTextNode(String(value));
    }

    // true while someone is typing in the profile, so a refresh never wipes what they entered
    function profileBusy() {
        var box = $("profile"), a = document.activeElement;
        if (a && box.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return true;
        return Array.prototype.some.call(box.querySelectorAll("input,textarea"), function (el) { return el.value !== ""; });
    }
    function openProfile(id, silent, force) {
        if (silent && !force && profileBusy()) return;
        if (!silent) curProfile = String(id);
        api("/api/staff/mod/lookup?id=" + encodeURIComponent(id)).then(function (d) {
            if (silent && ((!force && profileBusy()) || curProfile !== String(id))) return;
            canAct = d.canAct;
            catalog = Array.isArray(d.vehicleCatalog) ? d.vehicleCatalog : [];
            var p = d.player, box = clear($("profile")); box.hidden = false;
            var card = h("div", { class: "sp-card" });
            card.appendChild(h("h3", { text: (p.displayName || p.username || "Player " + p.userId) }));
            card.appendChild(h("div", { class: "sp-meta" }, "@" + (p.username || "unknown") + " · user id " + p.userId + " · ",
                h("a", { href: "https://www.roblox.com/users/" + encodeURIComponent(p.userId) + "/profile", target: "_blank", rel: "noopener noreferrer", text: "Roblox profile" })));
            if (d.activeBan) {
                var b = d.activeBan;
                card.appendChild(h("div", { class: "sp-banner" }, h("strong", { text: "Banned" }), " (" + length(b) + (b.expiresAt ? ", until " + when(b.expiresAt) : "") + ") by " + b.by + ": " + (b.reason || "no reason"),
                    h("div", { class: "sp-meta", text: when(b.at) })));
            }
            d.pending.forEach(function (q) { card.appendChild(h("div", { class: "sp-meta", text: "Waiting for the game: " + q.type + " (" + q.status + ")" })); });
            if (p.seen === false) card.appendChild(h("div", { class: "sp-meta", text: "This player has not been seen in the game yet, so game stats are not available." }));

            var st = h("div", { class: "sp-stats" });
            st.appendChild(stat("Money", money(p.money)));
            st.appendChild(stat("Police XP", num(p.xp.police)));
            st.appendChild(stat("Fire XP", num(p.xp.fire)));
            st.appendChild(stat("DOT XP", num(p.xp.dot)));
            st.appendChild(stat("First joined", p.firstJoined ? when(p.firstJoined) : "unknown"));
            st.appendChild(stat("Last joined", p.lastJoined ? when(p.lastJoined) : "unknown"));
            var created = (d.roblox && d.roblox.created) || p.accountCreated;
            st.appendChild(stat("Roblox account created", created ? when(created) : "unknown"));
            st.appendChild(stat("Time played", dur(p.playtimeSecs)));
            var bans = d.actions.filter(function (a) { return a.type === "ban"; }).length;
            var warns = d.actions.filter(function (a) { return a.type === "warn"; }).length;
            var kicks = d.actions.filter(function (a) { return a.type === "kick"; }).length;
            st.appendChild(stat("Bans / kicks / warnings", bans + " / " + kicks + " / " + warns));
            card.appendChild(st);

            if (canAct) {
                var row = h("div", { class: "sp-actions" });
                [["ban", "Ban", "bad"], ["unban", "Unban", "alt"], ["kick", "Kick", "alt"], ["warn", "Warn", "alt"]].forEach(function (a) {
                    row.appendChild(h("button", { type: "button", class: "sp-btn sm " + a[2], text: a[1], onclick: function () { prefill(p, a[0]); } }));
                });
                card.appendChild(row);
            }
            box.appendChild(card);

            box.appendChild(robloxCard(d.roblox, p));
            box.appendChild(botCard(p, d));
            box.appendChild(linksCard(p, d));
            box.appendChild(serversCard(d.servers || []));

            var vehicles = h("div", { class: "sp-card" }, h("h3", { text: "Vehicles owned (" + p.vehicles.length + ")" }));
            if (!p.vehicles.length) vehicles.appendChild(empty("None recorded."));
            else vehicles.appendChild(h("div", { class: "sp-tags" }, p.vehicles.map(function (v) { return h("span", { class: "sp-tag", text: v }); })));
            box.appendChild(vehicles);

            var passes = h("div", { class: "sp-card" }, h("h3", { text: "Gamepasses owned (" + p.gamepasses.length + ")" }));
            if (!p.gamepasses.length) passes.appendChild(empty("None recorded."));
            else passes.appendChild(h("div", { class: "sp-tags" }, p.gamepasses.map(function (v) { return h("span", { class: "sp-tag", text: v }); })));
            box.appendChild(passes);

            if (me && me.level >= 3) box.appendChild(removeCard(p));

            var keys = Object.keys(p.extra || {});
            if (keys.length) {
                var more = h("div", { class: "sp-card" }, h("h3", { text: "More" }));
                var ul = h("ul");
                keys.forEach(function (k) { ul.appendChild(h("li", null, h("strong", { text: k + ": " }), typeof p.extra[k] === "object" ? extraList(p.extra[k]) : document.createTextNode(String(p.extra[k])))); });
                more.appendChild(ul);
                box.appendChild(more);
            }

            var hist = h("div", { class: "sp-card" }, h("h3", { text: "Punishments and notes (" + d.actions.length + ")" }));
            if (!d.actions.length) hist.appendChild(empty("Clean record."));
            d.actions.forEach(function (a) { hist.appendChild(actionItem(a, false)); });
            var noteBox = h("textarea", { maxlength: "400", placeholder: "Add an internal note about this player", "aria-label": "Note" });
            hist.appendChild(noteBox);
            hist.appendChild(h("button", { type: "button", class: "sp-btn alt sm", text: "Save note", onclick: function (e) {
                busy(e.target, function () { return api("/api/staff/mod/action", { action: "note", user: String(p.userId), notes: noteBox.value }).then(function () { say("Note saved.", "good"); openProfile(p.userId); }); });
            } }));
            box.appendChild(hist);
            if (!silent) box.scrollIntoView({ behavior: "smooth", block: "start" });
        }).catch(silent ? function () {} : fail);
    }

    // keep what is on screen fresh (every 8 seconds while the page is visible)
    setInterval(function () {
        if (!me || document.hidden) return;
        if (curTab === "look" && curProfile) openProfile(curProfile, true);
        else if (curTab === "auto") loadAuto(true);
        else if (curTab === "bans") loadBans(true);
        else if (curTab === "log") loadLog(true);
    }, REFRESH_MS);

    // ---- Roblox account facts, bot / alt estimate, linked accounts
    function robloxCard(r, p) {
        var card = h("div", { class: "sp-card" }, h("h3", { text: "Roblox account" }));
        if (!r) { card.appendChild(empty("Roblox could not be reached, so account details are not available right now.")); return card; }
        var st = h("div", { class: "sp-stats" });
        st.appendChild(stat("Account age", r.ageDays == null ? "unknown" : r.ageDays.toLocaleString("en-GB") + " days"));
        st.appendChild(stat("Account created", r.created ? when(r.created) : (p.accountCreated ? when(p.accountCreated) : "unknown")));
        st.appendChild(stat("Friends", r.friends == null ? "unknown" : num(r.friends)));
        st.appendChild(stat("Followers", r.followers == null ? "unknown" : num(r.followers)));
        st.appendChild(stat("Following", r.following == null ? "unknown" : num(r.following)));
        st.appendChild(stat("Groups joined", r.groups == null ? "unknown" : num(r.groups)));
        st.appendChild(stat("Profile description", r.hasDescription == null ? "unknown" : r.hasDescription ? "Yes" : "Empty"));
        if (r.robloxBanned) st.appendChild(stat("Roblox status", "Banned by Roblox"));
        card.appendChild(st);
        card.appendChild(h("div", { class: "sp-meta", text: "Public Roblox data, refreshed about once an hour (last checked " + when(r.fetchedAt) + ")." }));
        return card;
    }

    var VERDICTS = { likely_bot: ["Likely a bot", "bad"], likely_alt: ["Likely an alt", "warn"], likely_real: ["Looks like a normal account", "ok"], unclear: ["Unclear", ""] };
    function meter(label, pct) {
        return h("div", null, h("div", null, h("strong", { text: label + ": " + pct + "%" })),
            h("div", { class: "sp-meter " + (pct >= 70 ? "hot" : pct >= 40 ? "mid" : "") }, h("i", { style: "width:" + Math.max(0, Math.min(100, Number(pct) || 0)) + "%" })));
    }
    function botCard(p, d) {
        var a = d.assessment;
        var card = h("div", { class: "sp-card" }, h("h3", { text: "Bot / alt check" }));
        if (!a) card.appendChild(h("div", { class: "sp-meta", text: "Not checked yet. The AI looks at the account's age, friends, followers, username, game history and similar accounts, then estimates how likely it is to be a bot or an alt." }));
        else {
            var v = VERDICTS[a.verdict] || VERDICTS.unclear;
            card.appendChild(h("div", null, h("span", { class: "sp-pill " + v[1], text: v[0] }), " ", h("span", { class: "sp-meta", text: (a.source === "ai" ? "AI estimate" : "Rule-based estimate (AI unavailable)") + " · " + when(a.at) + (a.stale ? " · out of date" : "") })));
            card.appendChild(h("div", { style: "margin-top:10px" }, meter("Chance it is a bot", a.botLikelihood), meter("Chance it is an alt", a.altLikelihood)));
            if (a.summary) card.appendChild(h("div", { class: "sp-body", text: a.summary }));
            if (a.reasons && a.reasons.length) card.appendChild(h("ul", null, a.reasons.map(function (r) { return h("li", { text: r }); })));
            if (a.suggestedChecks && a.suggestedChecks.length) card.appendChild(h("div", { class: "sp-meta", text: "Worth checking: " + a.suggestedChecks.join(" · ") }));
            card.appendChild(h("div", { class: "sp-meta", text: "This is only an estimate to help you decide. It cannot prove anything." }));
        }
        card.appendChild(h("div", { class: "sp-actions", style: "margin-top:10px" }, h("button", { type: "button", class: "sp-btn alt sm", text: a ? "Check again" : "Check with AI", onclick: function (e) {
            busy(e.target, function () { return api("/api/staff/mod/assess", { user: String(p.userId) }).then(function () { openProfile(p.userId, true, true); }); });
        } })));
        return card;
    }
    function linkAction(body, doneText, p) {
        return api("/api/staff/mod/action", body).then(function (r) {
            say(doneText + (r.alsoBanned && r.alsoBanned.length ? " Also banned: " + r.alsoBanned.map(function (x) { return x.username || x.userId; }).join(", ") + "." : ""), "good");
            openProfile(p.userId, true, true);
        });
    }
    function serversCard(list) {
        var card = h("div", { class: "sp-card" }, h("h3", { text: "Private servers (" + list.length + ")" }));
        if (!list.length) { card.appendChild(empty("No private servers registered by this player. A server appears here once its owner generates a Server API key.")); return card; }
        list.forEach(function (s) {
            var row = h("div", { class: "sp-item" },
                h("strong", { text: s.name || "Unnamed server" }), " ",
                h("span", { class: "sp-pill " + (s.online ? "ok" : ""), text: s.online ? "online" : "offline" }), " ",
                h("span", { class: "sp-meta", text: s.players != null ? s.players + "/" + s.maxPlayers + " players" : "no report yet" }));
            row.appendChild(h("div", null, "Join code: ", s.joinKey ? h("code", { text: s.joinKey }) : h("span", { class: "sp-meta", text: "not reported yet (the server has to run once with the Server API on)" })));
            row.appendChild(h("div", { class: "sp-meta", text: "Last report: " + (s.updatedAt ? when(s.updatedAt) : "never") + " · private server id " + s.id }));
            card.appendChild(row);
        });
        return card;
    }
    function linksCard(p, d) {
        var L = d.links || { alts: [] }, card = h("div", { class: "sp-card" }, h("h3", { text: "Linked accounts" }));
        card.appendChild(h("div", { class: "sp-meta", text: "If one account in a linked group is banned, every other account in it is banned too (like ER:LC). Unbanning only unbans the account you pick." }));
        function row(x, label) {
            var r = h("div", { class: "sp-item" }, h("strong", { text: (x.username || "Player " + x.userId) }), " ", h("span", { class: "sp-meta", text: "id " + x.userId + " · " + label }), x.banned ? h("span", { class: "sp-pill bad", text: " banned" }) : null, " ",
                h("button", { type: "button", class: "sp-btn alt sm", text: "Look up", onclick: function () { openProfile(x.userId); } }));
            if (d.canAct && label === "alt") r.appendChild(h("button", { type: "button", class: "sp-btn alt sm", text: "Unlink", onclick: function (e) {
                if (!confirm("Unlink " + (x.username || x.userId) + " from this group?")) return;
                busy(e.target, function () { return linkAction({ action: "unlink", user: String(x.userId) }, "Unlinked.", p); });
            } }));
            return r;
        }
        if (L.main) card.appendChild(row(L.main, "main account"));
        (L.alts || []).forEach(function (x) { card.appendChild(row(x, "alt")); });
        if (!L.main && !(L.alts || []).length) card.appendChild(empty("Not linked to any other account."));
        if (L.isAlt && d.canAct) card.appendChild(h("div", { class: "sp-actions" }, h("button", { type: "button", class: "sp-btn alt sm", text: "Unlink this account from its main", onclick: function (e) {
            busy(e.target, function () { return linkAction({ action: "unlink", user: String(p.userId) }, "Unlinked.", p); }); } })));
        if (d.canAct && !L.isAlt) {
            var rel = d.related || [];
            if (rel.length) {
                card.appendChild(h("div", { class: "sp-meta", style: "margin-top:12px", text: "Accounts with a similar name seen in this game:" }));
                rel.forEach(function (x) {
                    card.appendChild(h("div", { class: "sp-item" }, h("strong", { text: x.username }), " ", h("span", { class: "sp-meta", text: "id " + x.userId }), x.banned ? h("span", { class: "sp-pill bad", text: " banned" }) : null, " ",
                        h("button", { type: "button", class: "sp-btn alt sm", text: "Look up", onclick: function () { openProfile(x.userId); } }), " ",
                        h("button", { type: "button", class: "sp-btn sm", text: "Is an alt of this account", onclick: function (e) {
                            if (!confirm("Link " + x.username + " as an alt of " + (p.username || p.userId) + "? Banning either will ban both.")) return;
                            busy(e.target, function () { return linkAction({ action: "link", user: String(x.userId), main: String(p.userId) }, "Linked.", p); }); } }), " ",
                        h("button", { type: "button", class: "sp-btn sm", text: "This is an alt of them", onclick: function (e) {
                            if (!confirm("Link " + (p.username || p.userId) + " as an alt of " + x.username + "? Banning either will ban both.")) return;
                            busy(e.target, function () { return linkAction({ action: "link", user: String(p.userId), main: String(x.userId) }, "Linked.", p); }); } })));
                });
            }
            var mainIn = h("input", { type: "text", maxlength: "40", placeholder: "Main account (user id or username)", "aria-label": "Main account" });
            card.appendChild(h("div", { class: "sp-inline", style: "margin-top:12px" }, mainIn, h("button", { type: "button", class: "sp-btn sm", text: "Link this account as its alt", onclick: function (e) {
                if (!mainIn.value.trim()) return say("Enter the main account.", "err");
                if (!confirm("Link " + (p.username || p.userId) + " as an alt of " + mainIn.value.trim() + "? Banning either will ban both.")) return;
                busy(e.target, function () { return linkAction({ action: "link", user: String(p.userId), main: mainIn.value.trim() }, "Linked.", p); });
            } })));
        }
        return card;
    }

    // admin only: change a player's XP, money or vehicles (the server checks this again)
    function removeCard(p) {
        var card = h("div", { class: "sp-card" }, h("h3", { text: "Give or take XP, money and vehicles (admins only)" }),
            h("div", { class: "sp-meta", text: "The game does it within about 5 to 10 seconds. Online players are updated live; offline players are changed in the saved data. Every change is saved in the history." }));
        var reason = h("input", { type: "text", maxlength: "300", placeholder: "Reason (required, saved in the history)", "aria-label": "Reason" });
        card.appendChild(h("label", { text: "Reason" })); card.appendChild(reason);
        function send(body, label, btn) {
            if (!confirm(label + " for " + (p.username || p.userId) + "?")) return;
            body.user = String(p.userId); body.reason = reason.value;
            busy(btn, function () { return api("/api/staff/mod/action", body).then(function () { say("Sent. The game will do it within about 5 to 10 seconds.", "good"); reason.value = ""; }); });
        }
        var pool = h("select", { "aria-label": "Department" }, h("option", { value: "police", text: "Police / Sheriff XP" }), h("option", { value: "fire", text: "Fire XP" }), h("option", { value: "dot", text: "DOT XP" }));
        var xp = h("input", { type: "number", min: "1", step: "1", placeholder: "Amount", "aria-label": "XP to remove" });
        card.appendChild(h("div", { class: "sp-inline", style: "margin-top:12px" }, pool, xp, h("button", { type: "button", class: "sp-btn bad sm", text: "Remove XP", onclick: function (e) {
            send({ action: "removexp", pool: pool.value, amount: xp.value }, "Remove " + xp.value + " " + pool.options[pool.selectedIndex].text, e.target); } })));
        var gxp = h("input", { type: "number", min: "1", step: "1", placeholder: "Amount", "aria-label": "XP to give" });
        var gpool = h("select", { "aria-label": "Department to give XP in" }, h("option", { value: "police", text: "Police / Sheriff XP" }), h("option", { value: "fire", text: "Fire XP" }), h("option", { value: "dot", text: "DOT XP" }));
        card.appendChild(h("div", { class: "sp-inline", style: "margin-top:12px" }, gpool, gxp, h("button", { type: "button", class: "sp-btn sm", text: "Give XP", onclick: function (e) {
            send({ action: "givexp", pool: gpool.value, amount: gxp.value }, "Give " + gxp.value + " " + gpool.options[gpool.selectedIndex].text, e.target); } })));
        var gcash = h("input", { type: "number", min: "1", step: "1", placeholder: "Amount in $", "aria-label": "Money to give" });
        card.appendChild(h("div", { class: "sp-inline", style: "margin-top:12px" }, gcash, h("button", { type: "button", class: "sp-btn sm", text: "Give money", onclick: function (e) {
            send({ action: "givemoney", amount: gcash.value }, "Give $" + gcash.value, e.target); } })));
        var cash = h("input", { type: "number", min: "1", step: "1", placeholder: "Amount in $", "aria-label": "Money to remove" });
        card.appendChild(h("div", { class: "sp-inline", style: "margin-top:12px" }, cash, h("button", { type: "button", class: "sp-btn bad sm", text: "Remove money", onclick: function (e) {
            send({ action: "removemoney", amount: cash.value }, "Remove $" + cash.value, e.target); } })));
        var veh = h("select", { "aria-label": "Vehicle" });
        p.vehicles.forEach(function (v) { veh.appendChild(h("option", { value: v, text: v })); });
        if (p.vehicles.length) card.appendChild(h("div", { class: "sp-inline", style: "margin-top:12px" }, veh, h("button", { type: "button", class: "sp-btn bad sm", text: "Remove vehicle", onclick: function (e) {
            send({ action: "removevehicle", vehicle: veh.value }, "Remove the vehicle " + veh.value, e.target); } })));
        else card.appendChild(h("div", { class: "sp-meta", style: "margin-top:12px", text: "No vehicles recorded for this player." }));
        var owned = {}; p.vehicles.forEach(function (v) { owned[v] = true; });
        var avail = catalog.filter(function (v) { return !owned[v]; });
        if (avail.length) {
            var gveh = h("select", { "aria-label": "Vehicle to give" });
            avail.forEach(function (v) { gveh.appendChild(h("option", { value: v, text: v })); });
            card.appendChild(h("div", { class: "sp-inline", style: "margin-top:12px" }, gveh, h("button", { type: "button", class: "sp-btn sm", text: "Give vehicle", onclick: function (e) {
                send({ action: "givevehicle", vehicle: gveh.value }, "Give the vehicle " + gveh.value, e.target); } })));
        } else card.appendChild(h("div", { class: "sp-meta", style: "margin-top:12px", text: "The vehicle list has not arrived from the game yet (it is sent about 30 seconds after a server starts), so vehicles cannot be given right now." }));
        return card;
    }

    function actionItem(a, showName) {
        var cls = a.type === "ban" ? (a.active ? "bad" : "warn") : a.type === "unban" ? "ok" : a.type.indexOf("remove") === 0 ? "warn" : a.type.indexOf("give") === 0 ? "ok" : "";
        var title = h("div", null, h("span", { class: "sp-pill " + cls, text: a.type }), " ",
            h("strong", { text: (showName ? (a.username || a.userId) + " · " : "") + (a.type === "ban" ? length(a) : "") }),
            a.type === "ban" && a.active ? h("span", { class: "sp-pill bad", text: " active" }) : null);
        var item = h("div", { class: "sp-item" }, title);
        if (a.reason) item.appendChild(h("div", { class: "sp-body", text: a.reason }));
        if (a.notes) item.appendChild(h("div", { class: "sp-body sp-meta", text: "Notes: " + a.notes }));
        if (a.aiVerdict) item.appendChild(h("div", { class: "sp-meta", text: "AI: " + a.aiVerdict.replace(/_/g, " ") + (a.aiReason ? " – " + a.aiReason : "") }));
        item.appendChild(h("div", { class: "sp-meta", text: (a.source === "auto" ? "Anti-cheat" : a.by || "Game") + " · " + when(a.at) + (a.reviewed ? " · reviewed by " + a.reviewedBy : "") }));
        return item;
    }

    // ---- anti-cheat bans and banned list
    function loadAuto(quiet) {
        api("/api/staff/mod/feed?view=auto").then(function (d) {
            canAct = d.canAct;
            var box = clear($("auto-list"));
            if (!d.actions.length) { box.appendChild(empty("No anti-cheat bans yet.")); return; }
            d.actions.forEach(function (a) {
                var item = actionItem(a, true);
                var row = h("div", { class: "sp-actions" }, h("button", { type: "button", class: "sp-btn alt sm", text: "Look up", onclick: function () { openTab("look"); openProfile(a.userId); } }));
                if (canAct && !a.reviewed) row.appendChild(h("button", { type: "button", class: "sp-btn alt sm", text: "Mark reviewed", onclick: function (e) {
                    busy(e.target, function () { return api("/api/staff/mod/action", { action: "review", id: a.id }).then(loadAuto); }); } }));
                if (canAct && a.active) row.appendChild(h("button", { type: "button", class: "sp-btn sm", text: "Unban", onclick: function () { prefill({ userId: a.userId, username: a.username }, "unban"); } }));
                item.appendChild(row);
                box.appendChild(item);
            });
        }).catch(quiet === true ? function () {} : fail);
    }
    function loadBans(quiet) {
        api("/api/staff/mod/feed?view=bans").then(function (d) {
            canAct = d.canAct;
            var box = clear($("bans-list"));
            if (!d.actions.length) { box.appendChild(empty("Nobody is banned.")); return; }
            d.actions.forEach(function (a) {
                var item = actionItem(a, true);
                var row = h("div", { class: "sp-actions" }, h("button", { type: "button", class: "sp-btn alt sm", text: "Look up", onclick: function () { openTab("look"); openProfile(a.userId); } }));
                if (canAct) row.appendChild(h("button", { type: "button", class: "sp-btn sm", text: "Unban", onclick: function () { prefill({ userId: a.userId, username: a.username }, "unban"); } }));
                item.appendChild(row);
                box.appendChild(item);
            });
        }).catch(quiet === true ? function () {} : fail);
    }

    // ---- take action
    function syncForm() {
        var t = $("a-type").value;
        $("a-len-row").hidden = t !== "ban";
        $("a-alts-row").hidden = t !== "ban";
        $("a-notes-row").hidden = t !== "ban";
        $("a-reason-l").textContent = t === "note" ? "Note" : t === "unban" ? "Reason (optional)" : t === "warn" ? "Warning (the player sees this)" : "Reason (the player sees this)";
        $("a-go").textContent = { ban: "Ban", unban: "Unban", kick: "Kick", warn: "Send warning", note: "Save note" }[t];
        $("a-go").className = "sp-btn " + (t === "ban" || t === "kick" ? "bad" : "");
    }
    $("a-type").addEventListener("change", syncForm);
    function prefill(p, type) {
        openTab("act");
        $("a-user").value = String(p.userId);
        $("a-type").value = type; syncForm();
        $("a-reason").focus();
    }
    function loadAct() {
       
        syncForm();
        // learn the level once from the server
        api("/api/staff/mod/feed?view=queue").then(function (d) {
            canAct = d.canAct;
            $("ann-card").hidden = !canAct;
            $("noact").hidden = canAct;
            Array.prototype.forEach.call($("a-type").options, function (o) { o.hidden = !canAct && o.value !== "note"; o.disabled = !canAct && o.value !== "note"; });
            if (!canAct) { $("a-type").value = "note"; syncForm(); }
        }).catch(fail);
    }
    $("a-go").addEventListener("click", function (e) {
        var t = $("a-type").value, user = $("a-user").value.trim();
        var label = { ban: "Ban", unban: "Unban", kick: "Kick", warn: "Warn", note: "Add a note for" }[t];
        if (t !== "note" && !confirm(label + " " + user + "?" + (t === "ban" ? "\n\nAccounts linked to it as alts or main will be banned too." + ($("a-alts").checked ? " Roblox will also ban any alt accounts it detects." : "") : ""))) return;
        var body = { action: t, user: user, reason: $("a-reason").value, notes: t === "note" ? $("a-reason").value : $("a-notes").value, days: Number($("a-days").value), alts: $("a-alts").checked };
        busy(e.target, function () {
            return api("/api/staff/mod/action", body).then(function (r) {
                $("a-reason").value = ""; $("a-notes").value = "";
                say((t === "note" ? "Note saved." : "Sent. The game will carry it out within about 5 to 10 seconds.") + (r.alsoBanned && r.alsoBanned.length ? " Linked accounts also banned: " + r.alsoBanned.map(function (x) { return x.username || x.userId; }).join(", ") + "." : ""), "good");
            });
        });
    });
    $("g-go").addEventListener("click", function (e) {
        if (!confirm("Send this message to every server?")) return;
        busy(e.target, function () { return api("/api/staff/mod/action", { action: "announce", message: $("g-msg").value }).then(function () { $("g-msg").value = ""; say("Sent.", "good"); }); });
    });

    // ---- activity
    function loadLog(quiet) {
        api("/api/staff/mod/feed?view=queue").then(function (d) {
            var box = clear($("queue-list"));
            if (!d.queue.length) box.appendChild(empty("Nothing sent yet."));
            d.queue.slice(0, 20).forEach(function (q) {
                var item = h("div", { class: "sp-item" }, h("span", { class: "sp-pill " + (q.status === "done" ? "ok" : q.status === "failed" ? "bad" : "warn"), text: q.status }), " ",
                    h("strong", { text: q.type + (q.username ? " · " + q.username : "") }), h("div", { class: "sp-meta", text: q.by + " · " + when(q.at) + (q.result ? " · " + q.result : "") }));
                if (q.reason) item.appendChild(h("div", { class: "sp-body", text: q.reason }));
                if (q.status === "pending" && d.canAct) item.appendChild(h("div", { class: "sp-actions" }, h("button", { type: "button", class: "sp-btn alt sm", text: "Cancel", onclick: function (e) {
                    busy(e.target, function () { return api("/api/staff/mod/action", { action: "cancel", queueId: q.id }).then(loadLog); }); } })));
                box.appendChild(item);
            });
        }).catch(fail);
        api("/api/staff/mod/feed?view=actions").then(function (d) {
            var box = clear($("actions-list"));
            if (!d.actions.length) box.appendChild(empty("No actions yet."));
            d.actions.forEach(function (a) { box.appendChild(actionItem(a, true)); });
        }).catch(quiet === true ? function () {} : fail);
    }

    $("sp-logout").addEventListener("click", function (e) {
        busy(e.target, function () { return api("/api/staff/logout", {}).then(function () { me = null; $("sp-app").hidden = true; $("sp-login").hidden = false; }); });
    });

    start();
})();
