// Small helpers shared by the staff portal and the admin page.
// Everything is inserted as text (never as HTML), so nothing a staff member types can run as code in someone else's browser.
(function () {
    "use strict";
    var SP = {};

    SP.$ = function (id) { return document.getElementById(id); };

    SP.h = function (tag, attrs) {
        var el = document.createElement(tag);
        if (attrs) Object.keys(attrs).forEach(function (k) {
            if (k === "class") el.className = attrs[k];
            else if (k === "text") el.textContent = attrs[k];
            else if (k === "value") el.value = attrs[k];
            else if (k.indexOf("on") === 0) el.addEventListener(k.slice(2), attrs[k]);
            else el.setAttribute(k, attrs[k]);
        });
        for (var i = 2; i < arguments.length; i++) {
            var c = arguments[i];
            if (c == null || c === false) continue;
            el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
        }
        return el;
    };

    SP.clear = function (el) { while (el.firstChild) el.removeChild(el.firstChild); return el; };
    SP.when = function (sec) { return sec ? new Date(sec * 1000).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "never"; };
    SP.day = function (s) { var d = new Date(s + "T00:00:00Z"); return isNaN(d) ? s : d.toLocaleDateString("en-GB", { dateStyle: "medium", timeZone: "UTC" }); };
    SP.hours = function (sec) { var m = Math.round((sec || 0) / 60); return Math.floor(m / 60) + "h " + (m % 60) + "m"; };
    SP.ago = function (sec) {
        var d = Math.max(0, Math.floor(Date.now() / 1000) - sec);
        if (d < 90) return "just now";
        if (d < 5400) return Math.round(d / 60) + " min ago";
        if (d < 129600) return Math.round(d / 3600) + " h ago";
        return Math.round(d / 86400) + " days ago";
    };

    SP.avatar = function (id, hash) {
        if (id && hash && /^\d+$/.test(id) && /^[a-f0-9_]+$/i.test(hash)) {
            return SP.h("img", { src: "https://cdn.discordapp.com/avatars/" + id + "/" + hash + ".png?size=64", alt: "", width: "36", height: "36", referrerpolicy: "no-referrer" });
        }
        return SP.h("span", { class: "sp-av" });
    };

    SP.onUnauthorized = null; // set by each page: called when the session ends

    SP.say = function (text, kind) {
        var box = SP.$("sp-msg");
        if (!text) { box.hidden = true; return; }
        box.textContent = text;
        box.className = "sp-msg " + (kind || "");
        box.hidden = false;
        if (kind === "good") setTimeout(function () { if (box.textContent === text) box.hidden = true; }, 4000);
    };

    SP.api = function (path, body) {
        var opts = { credentials: "same-origin", headers: {} };
        if (body !== undefined) {
            opts.method = "POST";
            opts.headers["content-type"] = "application/json";
            opts.body = JSON.stringify(body);
        }
        return fetch(path, opts).then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (data) {
                if (res.status === 401 && SP.onUnauthorized) SP.onUnauthorized();
                if (!res.ok || data.success === false) throw new Error(data.error || "Something went wrong.");
                return data;
            });
        });
    };

    SP.busy = function (btn, fn) {
        btn.disabled = true;
        return Promise.resolve().then(fn).catch(function (e) { SP.say(e.message, "err"); }).then(function () { btn.disabled = false; });
    };

    SP.LOGIN_ERRORS = {
        setup: "The staff portal is not set up yet. Ask the website owner.",
        state: "That login did not complete safely. Please try again.",
        denied: "Login was cancelled.",
        discord: "Discord did not answer. Please try again.",
        noaccess: "Your Discord account does not have a staff role in the Westbrook County server.",
        suspended: "Your portal access is suspended. Ask an admin."
    };

    window.SP = SP;
})();
