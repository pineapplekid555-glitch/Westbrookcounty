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

    var TABS = ["over", "members", "strikes", "tasks", "sessions", "log", "data"];
    function openTab(n) {
        Array.prototype.forEach.call(document.querySelectorAll(".sp-tabs button"), function (b) { b.setAttribute("aria-selected", b.getAttribute("data-tab") === n ? "true" : "false"); });
        TABS.forEach(function (t) { $("tab-" + t).hidden = t !== n; });
        ({ over: loadOver, members: loadMembers, strikes: loadStrikes, tasks: loadTasks, sessions: loadSessions, log: loadLog, data: function () {} })[n]();
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

    var roster = null;
    function fillMembers(select, first) {
        var get = roster ? Promise.resolve(roster) : api("/api/staff/roster").then(function (d) { roster = d.members; return roster; });
        return get.then(function (ms) {
            clear(select);
            if (first) select.appendChild(h("option", { value: "", text: first }));
            ms.forEach(function (m) { select.appendChild(h("option", { value: m.discordId, text: m.name })); });
        });
    }

    function loadStrikes() {
        fillMembers($("strike-who")).catch(fail);
        api("/api/staff/strikes").then(function (d) {
            var box = clear($("strike-list"));
            if (!d.strikes.length) { box.appendChild(empty("No strikes have been issued.")); return; }
            d.strikes.forEach(function (s) {
                var status = s.revoked ? "revoked" : s.active ? "active" : "expired";
                var item = h("div", { class: "sp-item" },
                    h("div", null, h("strong", { text: s.name + " · Strike #" + s.id }), " ", h("span", { class: "sp-st " + (s.active ? "denied" : "cancelled"), text: status })),
                    h("div", { class: "sp-body", text: s.reason }),
                    h("div", { class: "sp-meta", text: "Issued by " + s.issuedBy + " · " + when(s.issuedAt) + (s.expiresAt ? " · expires " + when(s.expiresAt) : " · never expires") + (s.revoked ? " · revoked by " + s.revokedBy + (s.revokedNote ? " (" + s.revokedNote + ")" : "") : "") }));
                if (!s.revoked) {
                    var note = h("input", { type: "text", maxlength: "200", placeholder: "Why revoke? (optional)", "aria-label": "Revoke note" });
                    item.appendChild(h("div", { class: "sp-actions" }, h("button", { type: "button", class: "sp-btn alt sm", text: "Revoke", onclick: function (e) {
                        busy(e.target, function () { return api("/api/staff/strikes", { action: "revoke", id: s.id, note: note.value }).then(loadStrikes); }); } }), note));
                }
                box.appendChild(item);
            });
        }).catch(fail);
    }
    $("strike-send").addEventListener("click", function (e) {
        if (!confirm("Issue this strike? The member will see it in their portal.")) return;
        busy(e.target, function () {
            return api("/api/staff/strikes", { action: "issue", discordId: $("strike-who").value, reason: $("strike-reason").value, days: Number($("strike-days").value) }).then(function () {
                $("strike-reason").value = ""; say("Strike issued.", "good"); loadStrikes();
            });
        });
    });

    function loadTasks() {
        fillMembers($("task-who"), "Anyone").catch(fail);
        api("/api/staff/tasks").then(function (d) {
            var box = clear($("task-list"));
            if (!d.tasks.length) { box.appendChild(empty("No tasks.")); return; }
            d.tasks.forEach(function (t) {
                var done = t.status === "done";
                var check = h("input", { type: "checkbox", "aria-label": "Mark done", onchange: function (e) {
                    api("/api/staff/tasks", { action: done ? "reopen" : "done", id: t.id }).then(loadTasks).catch(function (err) { say(err.message, "err"); e.target.checked = done; });
                } });
                check.checked = done;
                var meta = (t.assigneeName ? "For " + t.assigneeName : "Anyone can do this") + (t.due ? " · due " + SP.day(t.due) : "") + " · added by " + t.createdBy + (t.adminLocked ? " (admin, locked)" : "") + (done ? " · done by " + t.doneBy : "");
                var item = h("div", { class: "sp-item" }, h("label", { class: "sp-check" }, check, h("strong", { text: t.title })), h("div", { class: "sp-meta", text: meta }));
                if (t.detail) item.appendChild(h("div", { class: "sp-body", text: t.detail }));
                item.appendChild(h("div", { class: "sp-actions" }, h("button", { type: "button", class: "sp-btn bad sm", text: "Delete", onclick: function (e) {
                    if (!confirm("Delete this task?")) return;
                    busy(e.target, function () { return api("/api/staff/tasks", { action: "delete", id: t.id }).then(loadTasks); }); } })));
                box.appendChild(item);
            });
        }).catch(fail);
    }
    $("task-send").addEventListener("click", function (e) {
        busy(e.target, function () {
            return api("/api/staff/tasks", { action: "create", title: $("task-title").value, detail: $("task-detail").value, assigneeId: $("task-who").value, due: $("task-due").value }).then(function () {
                $("task-title").value = ""; $("task-detail").value = ""; $("task-due").value = ""; say("Task added.", "good"); loadTasks();
            });
        });
    });

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
