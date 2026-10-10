// Staff portal front-end. All data comes from /api/staff/* and is checked on the server;
// this file only draws it. Everything is inserted as text (never as HTML), so nothing a staff
// member types can run as code in someone else's browser.
(function () {
    "use strict";

    var $ = function (id) { return document.getElementById(id); };
    var state = { me: null };

    function h(tag, attrs) {
        var el = document.createElement(tag);
        if (attrs) Object.keys(attrs).forEach(function (k) {
            if (k === "class") el.className = attrs[k];
            else if (k === "text") el.textContent = attrs[k];
            else if (k.indexOf("on") === 0) el.addEventListener(k.slice(2), attrs[k]);
            else el.setAttribute(k, attrs[k]);
        });
        for (var i = 2; i < arguments.length; i++) {
            var c = arguments[i];
            if (c == null) continue;
            el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
        }
        return el;
    }
    function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
    function when(sec) { return sec ? new Date(sec * 1000).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "never"; }
    function day(s) { var d = new Date(s + "T00:00:00Z"); return isNaN(d) ? s : d.toLocaleDateString("en-GB", { dateStyle: "medium", timeZone: "UTC" }); }

    function say(text, kind) {
        var box = $("sp-msg");
        if (!text) { box.hidden = true; return; }
        box.textContent = text;
        box.className = "sp-msg " + (kind || "");
        box.hidden = false;
        if (kind === "good") setTimeout(function () { if (box.textContent === text) box.hidden = true; }, 4000);
    }

    function api(path, body) {
        var opts = { credentials: "same-origin", headers: {} };
        if (body !== undefined) {
            opts.method = "POST";
            opts.headers["content-type"] = "application/json";
            opts.body = JSON.stringify(body);
        }
        return fetch(path, opts).then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (data) {
                if (res.status === 401 && state.me) { state.me = null; showLogin(); say("Your session ended. Please log in again.", "err"); }
                if (!res.ok || data.success === false) throw new Error(data.error || "Something went wrong.");
                return data;
            });
        });
    }

    function busy(btn, fn) {
        btn.disabled = true;
        return Promise.resolve().then(fn).catch(function (e) { say(e.message, "err"); }).then(function () { btn.disabled = false; });
    }

    // ---- login / session
    var LOGIN_ERRORS = {
        setup: "The staff portal is not set up yet. Ask the website owner.",
        state: "That login did not complete safely. Please try again.",
        denied: "Login was cancelled.",
        discord: "Discord did not answer. Please try again.",
        noaccess: "Your Discord account does not have a staff role in the Westbrook County server."
    };
    function showLogin() { $("sp-app").hidden = true; $("sp-login").hidden = false; }

    function avatar(id, hash) {
        if (id && hash && /^\d+$/.test(id) && /^[a-f0-9_]+$/i.test(hash)) {
            return h("img", { src: "https://cdn.discordapp.com/avatars/" + id + "/" + hash + ".png?size=64", alt: "", width: "36", height: "36", referrerpolicy: "no-referrer" });
        }
        return h("span", { class: "sp-av" });
    }

    function start() {
        var err = new URLSearchParams(location.search).get("e");
        if (err) { say(LOGIN_ERRORS[err] || "Login failed.", "err"); history.replaceState(null, "", location.pathname); }
        api("/api/staff/me").then(function (me) {
            state.me = me;
            $("sp-login").hidden = true;
            $("sp-app").hidden = false;
            clear($("sp-av")); $("sp-av").appendChild(avatar(me.id, me.avatar));
            $("sp-name").textContent = me.name;
            var badge = $("sp-level"); badge.textContent = me.levelName; badge.className = "sp-badge " + me.levelName;
            var manager = me.level >= 2, admin = me.level >= 3;
            $("ann-form-card").hidden = !manager;
            $("loa-all-card").hidden = !manager;
            $("roster-notes-h").hidden = !manager;
            $("roster-edit-h").hidden = !admin;
            $("rank-log-card").hidden = !manager;
            $("sp-audit-tab").hidden = !admin;
            loadAnnouncements();
        }).catch(function () { showLogin(); });
    }

    // ---- tabs
    function openTab(name) {
        Array.prototype.forEach.call(document.querySelectorAll(".sp-tabs button"), function (b) { b.setAttribute("aria-selected", b.getAttribute("data-tab") === name ? "true" : "false"); });
        ["ann", "loa", "roster", "audit"].forEach(function (t) { $("tab-" + t).hidden = t !== name; });
        if (name === "loa") loadLoa();
        if (name === "roster") loadRoster();
        if (name === "audit") loadAudit();
        if (name === "ann") loadAnnouncements();
    }
    Array.prototype.forEach.call(document.querySelectorAll(".sp-tabs button"), function (b) {
        b.addEventListener("click", function () { openTab(b.getAttribute("data-tab")); });
    });

    // ---- announcements
    function loadAnnouncements() {
        api("/api/staff/announcements").then(function (d) {
            var box = $("ann-list"); clear(box);
            if (!d.announcements.length) { box.appendChild(h("div", { class: "sp-empty", text: "No announcements yet." })); return; }
            var manager = state.me.level >= 2;
            d.announcements.forEach(function (a) {
                var actions = null;
                if (manager) {
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
                    h("div", { class: "sp-body", text: a.body }),
                    actions));
            });
        }).catch(function (e) { if (state.me) say(e.message, "err"); });
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
        var manager = state.me.level >= 2;
        api("/api/staff/loa").then(function (d) {
            var mine = $("loa-mine"); clear(mine);
            var own = d.requests.filter(function (r) { return r.discordId === state.me.id; });
            if (!own.length) mine.appendChild(h("div", { class: "sp-empty", text: "You have no requests." }));
            own.forEach(function (r) { mine.appendChild(loaItem(r, { cancel: true })); });
            if (manager) loadAllLoa();
        }).catch(function (e) { if (state.me) say(e.message, "err"); });
    }
    function loadAllLoa() {
        var f = $("loa-filter").value;
        api("/api/staff/loa" + (f ? "?status=" + encodeURIComponent(f) : "")).then(function (d) {
            var box = $("loa-all"); clear(box);
            if (!d.requests.length) box.appendChild(h("div", { class: "sp-empty", text: "Nothing here." }));
            d.requests.forEach(function (r) {
                var own = r.discordId === state.me.id;
                box.appendChild(loaItem(r, { showName: true, decide: !own || state.me.level >= 3 }));
            });
        }).catch(function (e) { say(e.message, "err"); });
    }
    $("loa-filter").addEventListener("change", loadAllLoa);
    $("loa-send").addEventListener("click", function (e) {
        busy(e.target, function () {
            return api("/api/staff/loa", { action: "create", start: $("loa-start").value, end: $("loa-end").value, reason: $("loa-reason").value }).then(function () {
                $("loa-reason").value = ""; say("Request sent.", "good"); loadLoa();
            });
        });
    });

    // ---- roster
    function loadRoster() {
        api("/api/staff/roster").then(function (d) {
            var manager = state.me.level >= 2, admin = state.me.level >= 3;
            var body = $("roster-body"); clear(body);
            d.members.forEach(function (m) {
                var rank = h("input", { type: "text", maxlength: "40", value: m.rank || "", "aria-label": "Rank for " + m.name });
                var notes = h("input", { type: "text", maxlength: "300", value: m.notes || "", "aria-label": "Notes for " + m.name });
                var row = h("tr", null,
                    h("td", null, h("span", { class: "sp-who" }, avatar(m.discordId, m.avatar), m.name)),
                    h("td", null, admin ? rank : (m.rank || "—")),
                    h("td", { text: when(m.lastLogin) }));
                if (manager) row.appendChild(h("td", null, admin ? notes : (m.notes || "")));
                if (admin) row.appendChild(h("td", null, h("button", { type: "button", class: "sp-btn sm", text: "Save", onclick: function (e) {
                    busy(e.target, function () { return api("/api/staff/roster", { discordId: m.discordId, rank: rank.value, notes: notes.value }).then(function () { say("Saved.", "good"); loadRoster(); }); }); } })));
                body.appendChild(row);
            });
            if (manager) {
                var log = $("rank-log"); clear(log);
                if (!d.history.length) log.appendChild(h("div", { class: "sp-empty", text: "No rank changes yet." }));
                d.history.forEach(function (l) {
                    log.appendChild(h("div", { class: "sp-item" }, h("strong", { text: l.name }), " " + (l.from || "none") + " → " + (l.to || "none"), h("div", { class: "sp-meta", text: "by " + l.by + " · " + when(l.at) })));
                });
            }
        }).catch(function (e) { say(e.message, "err"); });
    }

    // ---- audit
    function loadAudit() {
        api("/api/staff/audit").then(function (d) {
            var body = $("audit-body"); clear(body);
            d.entries.forEach(function (e) {
                body.appendChild(h("tr", null, h("td", { text: when(e.at) }), h("td", { text: e.by }), h("td", { text: e.action }), h("td", { text: e.detail })));
            });
        }).catch(function (e) { say(e.message, "err"); });
    }

    // ---- logout
    $("sp-logout").addEventListener("click", function (e) {
        busy(e.target, function () {
            return api("/api/staff/logout", {}).then(function () { state.me = null; showLogin(); say("You are logged out.", "good"); });
        });
    });

    start();
})();
