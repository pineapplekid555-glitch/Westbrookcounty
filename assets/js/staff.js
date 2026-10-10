// Staff portal front-end. All data comes from /api/staff/* and is checked on the server;
// this file only draws it. Everything is inserted as text (see staff-common.js).
(function () {
    "use strict";

    var SP = window.SP, $ = SP.$, h = SP.h, clear = SP.clear, when = SP.when, day = SP.day, api = SP.api, busy = SP.busy, say = SP.say;
    var state = { me: null, roster: null };

    function showLogin() { $("sp-app").hidden = true; $("sp-login").hidden = false; }
    SP.onUnauthorized = function () {
        if (!state.me) return;
        state.me = null; showLogin(); say("Your session ended. Please log in again.", "err");
    };
    function isManager() { return state.me && state.me.level >= 2; }
    function isAdmin() { return state.me && state.me.level >= 3; }
    function fail(e) { if (state.me) say(e.message, "err"); }
    function empty(text) { return h("div", { class: "sp-empty", text: text }); }

    // ---- start
    function start() {
        var err = new URLSearchParams(location.search).get("e");
        if (err) { say(SP.LOGIN_ERRORS[err] || "Login failed.", "err"); history.replaceState(null, "", location.pathname); }
        api("/api/staff/me").then(function (me) {
            state.me = me;
            $("sp-login").hidden = true;
            $("sp-app").hidden = false;
            clear($("sp-av")); $("sp-av").appendChild(SP.avatar(me.id, me.avatar));
            $("sp-name").textContent = me.name;
            var badge = $("sp-level"); badge.textContent = me.levelName; badge.className = "sp-badge " + me.levelName;
            $("ann-form-card").hidden = !isManager();
            $("loa-all-card").hidden = !isManager();
            $("roster-notes-h").hidden = !isManager();
            $("roster-edit-h").hidden = !isAdmin();
            $("rank-log-card").hidden = !isManager();
            $("task-form-card").hidden = !isManager();
            
            $("sp-admin-link").hidden = !isAdmin();
            openTab("dash");
        }).catch(function () { showLogin(); });
    }

    // ---- tabs
    function openTab(name) {
        Array.prototype.forEach.call(document.querySelectorAll(".sp-tabs button"), function (b) { b.setAttribute("aria-selected", b.getAttribute("data-tab") === name ? "true" : "false"); });
        ["dash", "ann", "loa", "duty", "tasks", "strikes", "roster"].forEach(function (t) { $("tab-" + t).hidden = t !== name; });
        ({ dash: loadDash, ann: loadAnnouncements, loa: loadLoa, duty: loadDuty, tasks: loadTasks, strikes: loadStrikes, roster: loadRoster })[name]();
    }
    Array.prototype.forEach.call(document.querySelectorAll(".sp-tabs button"), function (b) {
        b.addEventListener("click", function () { openTab(b.getAttribute("data-tab")); });
    });
    function goTab(name) { return function () { openTab(name); window.scrollTo({ top: 0, behavior: "smooth" }); }; }

    function getRoster() {
        if (state.roster) return Promise.resolve(state.roster);
        return api("/api/staff/roster").then(function (d) { state.roster = d.members; return d.members; });
    }
    function fillMembers(select, first) {
        return getRoster().then(function (members) {
            clear(select);
            if (first) select.appendChild(h("option", { value: "", text: first }));
            members.forEach(function (m) { if (m.discordId !== state.me.id) select.appendChild(h("option", { value: m.discordId, text: m.name })); });
        });
    }

    // ---- clock in / out (used by the dashboard and the Duty tab)
    function clockButton(btn, onDuty, after) {
        btn.textContent = onDuty ? "Clock out" : "Clock in";
        btn.className = "sp-btn sp-clock" + (onDuty ? " on" : "");
        btn.onclick = function () {
            busy(btn, function () { return api("/api/staff/duty", { action: onDuty ? "stop" : "start" }).then(function () { say(onDuty ? "Clocked out." : "Clocked in.", "good"); return after(); }); });
        };
    }

    // ---- dashboard
    function tile(n, label, goto, alert) {
        var el = h(goto ? "a" : "div", { class: "sp-tile" + (alert ? " alert" : ""), href: goto ? "#" : null }, h("div", { class: "n", text: String(n) }), h("div", { class: "l", text: label }));
        if (goto) el.addEventListener("click", function (e) { e.preventDefault(); goTab(goto)(); });
        return el;
    }
    function loadDash() {
        Promise.all([api("/api/staff/dashboard"), api("/api/staff/duty")]).then(function (res) {
            var d = res[0], duty = res[1];
            $("d-hello").textContent = "Welcome back, " + state.me.name;
            $("d-sub").textContent = duty.onDuty ? "You are on duty (since " + when(duty.since) + ")" : "You are off duty. This week: " + SP.hours(duty.mySeconds);
            clockButton($("d-clock"), duty.onDuty, loadDash);

            var tiles = $("d-tiles"); clear(tiles);
            tiles.appendChild(tile(d.counts.onDuty, "On duty now", "duty"));
            tiles.appendChild(tile(d.counts.onLeave, "On leave today", "loa"));
            tiles.appendChild(tile(d.counts.staff, "Staff members", "roster"));
            tiles.appendChild(tile(d.mine.openTasks, "My open tasks", "tasks", d.mine.openTasks > 0));
            if (d.mine.activeStrikes) tiles.appendChild(tile(d.mine.activeStrikes, "My active strikes", "strikes", true));
            if (d.mine.pendingLoa) tiles.appendChild(tile(d.mine.pendingLoa, "My LOA waiting", "loa"));
            if (d.manager) {
                tiles.appendChild(tile(d.manager.pendingLoa, "LOA to review", "loa", d.manager.pendingLoa > 0));
                tiles.appendChild(tile(d.manager.openTasks, "Open tasks (all)", "tasks"));
                if (d.manager.activeStrikes != null) tiles.appendChild(tile(d.manager.activeStrikes, "Active strikes (all)", "strikes"));
            }
            var live = tile("…", "Players in game");
            tiles.appendChild(live);
            fetch("/api/stats").then(function (r) { return r.ok ? r.json() : null; }).then(function (s) {
                if (s && typeof s.playing === "number") live.querySelector(".n").textContent = String(s.playing);
                else live.parentNode && live.parentNode.removeChild(live);
            }).catch(function () { live.parentNode && live.parentNode.removeChild(live); });

            var news = clear($("d-news"));
            if (!d.announcements.length) news.appendChild(empty("No announcements yet."));
            d.announcements.forEach(function (a) {
                news.appendChild(h("div", { class: "sp-item" }, h("strong", { text: (a.pinned ? "📌 " : "") + a.title }), h("div", { class: "sp-meta", text: a.authorName + " · " + SP.ago(a.createdAt) }), h("div", { class: "sp-body", text: a.body })));
            });
            news.appendChild(h("button", { type: "button", class: "sp-link", text: "All announcements", onclick: goTab("ann") }));

            var on = clear($("d-duty"));
            if (!d.onDuty.length) on.appendChild(empty("Nobody is clocked in."));
            d.onDuty.forEach(function (p) { on.appendChild(h("div", { class: "sp-item" }, h("span", { class: "sp-live" }), h("strong", { text: p.name }), h("span", { class: "sp-meta", text: " since " + when(p.since) }))); });

            var away = clear($("d-away"));
            if (!d.onLeave.length && !d.upcomingLeave.length) away.appendChild(empty("Nobody is on leave."));
            d.onLeave.forEach(function (p) { away.appendChild(h("div", { class: "sp-item" }, h("strong", { text: p.name }), h("span", { class: "sp-meta", text: " away until " + day(p.end) }))); });
            d.upcomingLeave.forEach(function (p) { away.appendChild(h("div", { class: "sp-item" }, h("strong", { text: p.name }), h("span", { class: "sp-meta", text: " " + day(p.start) + " to " + day(p.end) }))); });

            $("d-recent-card").hidden = !(d.manager && d.manager.recent);
            if (d.manager && d.manager.recent) {
                var rc = clear($("d-recent"));
                if (!d.manager.recent.length) rc.appendChild(empty("Nothing yet."));
                d.manager.recent.forEach(function (r) { rc.appendChild(h("div", { class: "sp-item" }, h("strong", { text: r.by }), " " + r.action.replace(".", " ") + (r.detail ? " – " + r.detail : ""), h("div", { class: "sp-meta", text: SP.ago(r.at) }))); });
            }
        }).catch(fail);
    }

    // ---- announcements
    function loadAnnouncements() {
        api("/api/staff/announcements").then(function (d) {
            var box = clear($("ann-list"));
            if (!d.announcements.length) { box.appendChild(empty("No announcements yet.")); return; }
            d.announcements.forEach(function (a) {
                var actions = null;
                if (isManager()) {
                    actions = h("div", { class: "sp-actions" },
                        h("button", { type: "button", class: "sp-btn alt sm", text: a.pinned ? "Unpin" : "Pin", onclick: function (e) {
                            busy(e.target, function () { return api("/api/staff/announcements", { action: "pin", id: a.id, pinned: !a.pinned }).then(loadAnnouncements); }); } }),
                        h("button", { type: "button", class: "sp-btn bad sm", text: "Delete", onclick: function (e) {
                            if (!confirm("Delete this announcement?")) return;
                            busy(e.target, function () { return api("/api/staff/announcements", { action: "delete", id: a.id }).then(loadAnnouncements); }); } }));
                }
                box.appendChild(h("div", { class: "sp-item" },
                    h("h4", { text: (a.pinned ? "📌 " : "") + a.title }),
                    h("div", { class: "sp-meta", text: a.authorName + " · " + when(a.createdAt) }),
                    h("div", { class: "sp-body", text: a.body }), actions));
            });
        }).catch(fail);
    }
    $("ann-send").addEventListener("click", function (e) {
        busy(e.target, function () {
            return api("/api/staff/announcements", { action: "create", title: $("ann-title").value, body: $("ann-body").value, pinned: $("ann-pin").checked, notifyDiscord: $("ann-discord").checked }).then(function (d) {
                $("ann-title").value = ""; $("ann-body").value = ""; $("ann-pin").checked = false; $("ann-discord").checked = false;
                say(d.discordSent ? "Posted, and sent to Discord." : "Posted.", "good");
                loadAnnouncements();
            });
        });
    });

    // ---- LOA
    function loaItem(r, opts) {
        var item = h("div", { class: "sp-item" },
            h("div", null, h("strong", { text: (opts.showName ? r.name + " · " : "") + day(r.start) + " to " + day(r.end) }), " ", h("span", { class: "sp-st " + r.status, text: r.status })),
            h("div", { class: "sp-body", text: r.reason }));
        if (r.status !== "pending" && r.decidedBy) item.appendChild(h("div", { class: "sp-meta", text: r.status + " by " + r.decidedBy + (r.decidedAt ? " · " + when(r.decidedAt) : "") + (r.note ? " · “" + r.note + "”" : "") }));
        var actions = h("div", { class: "sp-actions" });
        if (opts.decide && r.status === "pending") {
            var note = h("input", { type: "text", maxlength: "300", placeholder: "Note (optional)", "aria-label": "Note" });
            ["approved", "denied"].forEach(function (decision) {
                actions.appendChild(h("button", { type: "button", class: "sp-btn sm " + (decision === "denied" ? "bad" : ""), text: decision === "approved" ? "Approve" : "Deny", onclick: function (e) {
                    busy(e.target, function () { return api("/api/staff/loa", { action: "decide", id: r.id, decision: decision, note: note.value }).then(loadLoa); }); } }));
            });
            actions.appendChild(note);
        }
        if (opts.cancel && (r.status === "pending" || r.status === "approved")) {
            actions.appendChild(h("button", { type: "button", class: "sp-btn alt sm", text: "Cancel request", onclick: function (e) {
                if (!confirm("Cancel this request?")) return;
                busy(e.target, function () { return api("/api/staff/loa", { action: "cancel", id: r.id }).then(loadLoa); }); } }));
        }
        if (actions.childNodes.length) item.appendChild(actions);
        return item;
    }
    function loadLoa() {
        api("/api/staff/loa").then(function (d) {
            var mine = clear($("loa-mine"));
            var own = d.requests.filter(function (r) { return r.discordId === state.me.id; });
            if (!own.length) mine.appendChild(empty("You have no requests."));
            own.forEach(function (r) { mine.appendChild(loaItem(r, { cancel: true })); });
            if (isManager()) loadAllLoa();
        }).catch(fail);
    }
    function loadAllLoa() {
        var f = $("loa-filter").value;
        api("/api/staff/loa" + (f ? "?status=" + encodeURIComponent(f) : "")).then(function (d) {
            var box = clear($("loa-all"));
            if (!d.requests.length) box.appendChild(empty("Nothing here."));
            d.requests.forEach(function (r) { box.appendChild(loaItem(r, { showName: true, decide: r.discordId !== state.me.id || isAdmin() })); });
        }).catch(fail);
    }
    $("loa-filter").addEventListener("change", loadAllLoa);
    $("loa-send").addEventListener("click", function (e) {
        busy(e.target, function () {
            return api("/api/staff/loa", { action: "create", start: $("loa-start").value, end: $("loa-end").value, reason: $("loa-reason").value }).then(function () {
                $("loa-reason").value = ""; say("Request sent.", "good"); loadLoa();
            });
        });
    });

    // ---- duty
    function loadDuty() {
        api("/api/staff/duty").then(function (d) {
            $("duty-status").textContent = d.onDuty ? "You are on duty" : "You are off duty";
            $("duty-sub").textContent = (d.onDuty ? "Since " + when(d.since) + ". " : "") + "Your hours this week: " + SP.hours(d.mySeconds);
            clockButton($("duty-clock"), d.onDuty, loadDuty);
            var now = clear($("duty-now"));
            if (!d.whoIsOn.length) now.appendChild(empty("Nobody is clocked in."));
            d.whoIsOn.forEach(function (p) {
                var row = h("div", { class: "sp-item" }, h("span", { class: "sp-live" }), h("strong", { text: p.name }), h("span", { class: "sp-meta", text: " since " + when(p.since) }));
                if (isManager() && p.discordId !== state.me.id) {
                    row.appendChild(h("div", { class: "sp-actions" }, h("button", { type: "button", class: "sp-btn alt sm", text: "Clock out", onclick: function (e) {
                        busy(e.target, function () { return api("/api/staff/duty", { action: "stop", discordId: p.discordId }).then(loadDuty); }); } })));
                }
                now.appendChild(row);
            });
            $("duty-week-card").hidden = !d.week;
            if (d.week) {
                var box = clear($("duty-week"));
                if (!d.week.length) box.appendChild(empty("No hours logged yet this week."));
                var max = Math.max.apply(null, d.week.map(function (w) { return w.seconds; }).concat([1]));
                d.week.forEach(function (w) {
                    var fill = h("div", { class: "sp-fill" }); fill.style.width = Math.max(2, Math.round(w.seconds / max * 100)) + "%";
                    box.appendChild(h("div", { class: "sp-bar-row" }, h("span", { text: w.name }), h("div", { class: "sp-track" }, fill), h("span", { text: SP.hours(w.seconds) })));
                });
            }
        }).catch(fail);
    }

    // ---- tasks
    function loadTasks() {
        $("task-title-h").textContent = isManager() ? "All tasks" : "My tasks";
        if (isManager()) fillMembers($("task-who"), "Anyone").catch(fail);
        api("/api/staff/tasks").then(function (d) {
            var box = clear($("task-list"));
            if (!d.tasks.length) { box.appendChild(empty("No tasks.")); return; }
            d.tasks.forEach(function (t) {
                var done = t.status === "done";
                var check = h("input", { type: "checkbox", "aria-label": "Mark done", onchange: function (e) {
                    api("/api/staff/tasks", { action: done ? "reopen" : "done", id: t.id }).then(loadTasks).catch(function (err) { say(err.message, "err"); e.target.checked = done; });
                } });
                check.checked = done;
                var meta = (t.assigneeName ? "For " + t.assigneeName : "Anyone can do this") + (t.due ? " · due " + day(t.due) : "") + " · added by " + t.createdBy + (done ? " · done by " + t.doneBy : "");
                var item = h("div", { class: "sp-item" }, h("label", { class: "sp-check" }, check, h("strong", { text: t.title })), h("div", { class: "sp-meta", text: meta }));
                if (t.detail) item.appendChild(h("div", { class: "sp-body", text: t.detail }));
                if (t.adminLocked) item.appendChild(h("div", { class: "sp-meta", text: "Set by an admin" + (isAdmin() ? "" : " – only an admin can delete this") }));
                if (isManager() && (!t.adminLocked || isAdmin())) item.appendChild(h("div", { class: "sp-actions" }, h("button", { type: "button", class: "sp-btn bad sm", text: "Delete", onclick: function (e) {
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

    // ---- strikes
    function loadStrikes() {
        api("/api/staff/strikes").then(function (d) {
            var box = clear($("strike-list"));
            if (!d.strikes.length) { box.appendChild(empty("You have no strikes. Keep it up!")); return; }
            d.strikes.forEach(function (s) {
                var status = s.revoked ? "revoked" : s.active ? "active" : "expired";
                var item = h("div", { class: "sp-item" },
                    h("div", null, h("strong", { text: "Strike #" + s.id }), " ", h("span", { class: "sp-st " + (s.active ? "denied" : "cancelled"), text: status })),
                    h("div", { class: "sp-body", text: s.reason }),
                    h("div", { class: "sp-meta", text: "Issued by " + s.issuedBy + " · " + when(s.issuedAt) + (s.expiresAt ? " · expires " + when(s.expiresAt) : " · never expires") + (s.revoked ? " · revoked by " + s.revokedBy + (s.revokedNote ? " (" + s.revokedNote + ")" : "") : "") }));
                box.appendChild(item);
            });
        }).catch(fail);
    }
    // ---- roster
    function loadRoster() {
        api("/api/staff/roster").then(function (d) {
            state.roster = d.members;
            var body = clear($("roster-body"));
            d.members.forEach(function (m) {
                var rank = h("input", { type: "text", maxlength: "40", value: m.rank || "", "aria-label": "Rank for " + m.name });
                var notes = h("input", { type: "text", maxlength: "300", value: m.notes || "", "aria-label": "Notes for " + m.name });
                var row = h("tr", null,
                    h("td", null, h("span", { class: "sp-who" }, SP.avatar(m.discordId, m.avatar), m.name)),
                    h("td", null, isAdmin() ? rank : (m.rank || "—")),
                    h("td", { text: when(m.lastLogin) }));
                if (isManager()) row.appendChild(h("td", null, isAdmin() ? notes : (m.notes || "")));
                if (isAdmin()) row.appendChild(h("td", null, h("button", { type: "button", class: "sp-btn sm", text: "Save", onclick: function (e) {
                    busy(e.target, function () { return api("/api/staff/roster", { discordId: m.discordId, rank: rank.value, notes: notes.value }).then(function () { say("Saved.", "good"); loadRoster(); }); }); } })));
                body.appendChild(row);
            });
            if (isManager()) {
                var log = clear($("rank-log"));
                if (!d.history.length) log.appendChild(empty("No rank changes yet."));
                d.history.forEach(function (l) {
                    log.appendChild(h("div", { class: "sp-item" }, h("strong", { text: l.name }), " " + (l.from || "none") + " → " + (l.to || "none"), h("div", { class: "sp-meta", text: "by " + l.by + " · " + when(l.at) })));
                });
            }
        }).catch(fail);
    }

    // ---- logout
    $("sp-logout").addEventListener("click", function (e) {
        busy(e.target, function () {
            return api("/api/staff/logout", {}).then(function () { state.me = null; showLogin(); say("You are logged out.", "good"); });
        });
    });

    start();
})();
