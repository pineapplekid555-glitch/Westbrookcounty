// Staff admin page. Admin-only; the server re-checks every request. All content is inserted as text.
(function () {
    "use strict";
    var SP = window.SP, $ = SP.$, h = SP.h, clear = SP.clear, api = SP.api, busy = SP.busy, say = SP.say, when = SP.when;
    var me = null;

    function show(id) { ["sp-login", "sp-denied", "sp-app"].forEach(function (x) { $(x).hidden = x !== id; }); }
    SP.onUnauthorized = function () { if (me) { me = null; show("sp-login"); say("Your session ended. Please log in again.", "err"); } };
    function fail(e) { say(e.message, "err"); }
    function empty(t) { return h("div", { class: "sp-empty", text: t }); }

    function start() {
        var err = new URLSearchParams(location.search).get("e");
        if (err) { say(SP.LOGIN_ERRORS[err] || "Login failed.", "err"); history.replaceState(null, "", location.pathname); }
        api("/api/staff/me").then(function (d) {
            me = d;
            if (d.level < 3) { show("sp-denied"); return; }
            show("sp-app");
            clear($("sp-av")).appendChild(SP.avatar(d.id, d.avatar));
            $("sp-name").textContent = d.name;
            $("sp-level").textContent = d.levelName; $("sp-level").className = "sp-badge " + d.levelName;
            buildExports();
            openTab("over");
        }).catch(function () { show("sp-login"); });
    }

    var TABS = ["over", "members", "sessions", "log", "data"];
    function openTab(n) {
        Array.prototype.forEach.call(document.querySelectorAll(".sp-tabs button"), function (b) { b.setAttribute("aria-selected", b.getAttribute("data-tab") === n ? "true" : "false"); });
        TABS.forEach(function (t) { $("tab-" + t).hidden = t !== n; });
        ({ over: loadOver, members: loadMembers, sessions: loadSessions, log: loadLog, data: function () {} })[n]();
    }
    Array.prototype.forEach.call(document.querySelectorAll(".sp-tabs button"), function (b) {
        b.addEventListener("click", function () { openTab(b.getAttribute("data-tab")); });
    });

    function loadOver() {
        api("/api/staff/admin/overview").then(function (d) {
            var s = d.setup, box = clear($("o-setup"));
            function row(label, ok, note) {
                box.appendChild(h("div", { class: "sp-item" }, h("strong", { text: label + " " }), h("span", { class: ok ? "sp-ok" : "sp-no", text: ok ? "OK" : "Missing" }), note ? h("div", { class: "sp-meta", text: note }) : null));
            }
            row("Database", s.database.indexOf("STAFF_DB") === 0, s.database);
            row("Discord login", s.discordLogin, "Client ID, secret and server ID");
            row("Staff roles", s.staffRoles > 0, s.staffRoles + " role id(s)");
            row("Manager roles", s.managerRoles > 0, s.managerRoles + " role id(s)");
            row("Admin roles / protected admins", s.adminRoles + s.alwaysAdmins > 0, s.adminRoles + " role(s), " + s.alwaysAdmins + " protected admin(s)");
            row("Discord announcement posting", s.announceWebhook, s.announceWebhook ? "Ready" : "Optional: set STAFF_ANNOUNCE_WEBHOOK, or DISCORD_BOT_TOKEN + STAFF_CHAT_CHANNEL_ID");
            var t = clear($("o-tiles")), c = d.counts;
            [["members", "Members"], ["activeSessions", "Active sessions"], ["suspended", "Suspended"], ["loa", "LOA requests"], ["announcements", "Announcements"], ["strikes", "Strikes"], ["tasks", "Tasks"], ["shifts", "Shifts"], ["auditEntries", "Log entries"]].forEach(function (p) {
                t.appendChild(h("div", { class: "sp-tile" }, h("div", { class: "n", text: c[p[0]] == null ? "?" : String(c[p[0]]) }), h("div", { class: "l", text: p[1] })));
            });
        }).catch(fail);
    }

    function act(btn, body, ok) {
        return busy(btn, function () { return api("/api/staff/admin/members", body).then(function () { say(ok, "good"); loadMembers(); }); });
    }
    function loadMembers() {
        api("/api/staff/admin/members").then(function (d) {
            var tb = clear($("m-body"));
            if (!d.members.length) { tb.appendChild(h("tr", null, h("td", { colspan: "7" }, empty("Nobody has logged in yet.")))); return; }
            d.members.forEach(function (m) {
                var actions = h("td");
                if (!m.protected && m.discordId !== me.id) {
                    if (m.suspended) actions.appendChild(h("button", { type: "button", class: "sp-btn alt sm", text: "Unsuspend", onclick: function (e) { act(e.target, { action: "unsuspend", discordId: m.discordId }, "Unsuspended."); } }));
                    else actions.appendChild(h("button", { type: "button", class: "sp-btn bad sm", text: "Suspend", onclick: function (e) {
                        var r = prompt("Reason for suspending " + m.name + "?");
                        if (r === null) return;
                        act(e.target, { action: "suspend", discordId: m.discordId, reason: r }, "Suspended.");
                    } }));
                }
                if (m.sessions) actions.appendChild(h("button", { type: "button", class: "sp-btn alt sm", text: "Log out", onclick: function (e) { act(e.target, { action: "logout", discordId: m.discordId }, "Logged out."); } }));
                tb.appendChild(h("tr", null,
                    h("td", { text: m.name + (m.protected ? " (protected)" : "") }),
                    h("td", null, h("span", { class: "sp-badge " + m.level, text: m.level })),
                    h("td", { text: m.suspended ? "Suspended" + (m.reason ? ": " + m.reason : "") : "Active" }),
                    h("td", { text: String(m.sessions) }),
                    h("td", { text: String(m.strikes) }),
                    h("td", { text: when(m.lastLogin) }),
                    actions));
            });
        }).catch(fail);
    }

    function loadSessions() {
        api("/api/staff/admin/sessions").then(function (d) {
            var box = clear($("s-list"));
            if (!d.sessions.length) box.appendChild(empty("No active sessions."));
            d.sessions.forEach(function (s) {
                var item = h("div", { class: "sp-item" }, h("strong", { text: s.name }), " ", h("span", { class: "sp-badge " + s.level, text: s.level }),
                    h("div", { class: "sp-meta", text: "Signed in " + when(s.createdAt) + " · expires " + when(s.expiresAt) + (s.current ? " · this is you" : "") }));
                if (!s.current) item.appendChild(h("div", { class: "sp-actions" }, h("button", { type: "button", class: "sp-btn alt sm", text: "End session", onclick: function (e) {
                    busy(e.target, function () { return api("/api/staff/admin/sessions", { action: "revoke", id: s.id }).then(function () { say("Session ended.", "good"); loadSessions(); }); });
                } })));
                box.appendChild(item);
            });
        }).catch(fail);
    }
    $("s-all").addEventListener("click", function (e) {
        if (!confirm("Log out every other signed-in person?")) return;
        busy(e.target, function () { return api("/api/staff/admin/sessions", { action: "revokeAll" }).then(function () { say("Everyone else was logged out.", "good"); loadSessions(); }); });
    });

    function loadLog() {
        var q = $("l-q").value.trim();
        api("/api/staff/audit?limit=200" + (q ? "&q=" + encodeURIComponent(q) : "")).then(function (d) {
            var tb = clear($("l-body"));
            if (!d.entries.length) tb.appendChild(h("tr", null, h("td", { colspan: "4" }, empty("Nothing found."))));
            d.entries.forEach(function (x) {
                tb.appendChild(h("tr", null, h("td", { text: when(x.at) }), h("td", { text: x.by }), h("td", { text: x.action }), h("td", { text: x.detail })));
            });
        }).catch(fail);
    }
    $("l-go").addEventListener("click", loadLog);
    $("l-q").addEventListener("keydown", function (e) { if (e.key === "Enter") loadLog(); });

    function buildExports() {
        var box = clear($("x-links"));
        [["loa", "LOA"], ["roster", "Roster"], ["audit", "Activity log"], ["strikes", "Strikes"], ["duty", "Shifts"], ["tasks", "Tasks"], ["announcements", "Announcements"]].forEach(function (p) {
            box.appendChild(h("a", { class: "sp-btn alt sm", href: "/api/staff/admin/export?table=" + p[0], text: p[1] }));
        });
    }

    $("p-go").addEventListener("click", function (e) {
        var what = $("p-what").value, days = Number($("p-days").value);
        if (!confirm("Permanently delete " + $("p-what").selectedOptions[0].text.toLowerCase() + " older than " + days + " days?")) return;
        busy(e.target, function () {
            return api("/api/staff/admin/maintenance", { action: "purge", what: what, olderThanDays: days }).then(function (d) { say("Deleted " + d.deleted + " record(s).", "good"); });
        });
    });

    $("sp-logout").addEventListener("click", function () {
        fetch("/api/staff/logout", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: "{}" }).finally(function () { me = null; show("sp-login"); });
    });

    start();
})();
