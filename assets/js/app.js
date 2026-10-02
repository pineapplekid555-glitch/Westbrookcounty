(function () {
    "use strict";

    const content = window.WESTBROOK_CONTENT || {};

    function $(selector) {
        return document.querySelector(selector);
    }

    function createElement(tag, className, text) {
        const element = document.createElement(tag);

        if (className) {
            element.className = className;
        }

        if (text !== undefined) {
            element.textContent = text;
        }

        return element;
    }


    /*
     * ================================
     * HIGHLIGHTS
     * ================================
     */

    function renderHighlights() {
        const containers = document.querySelectorAll("[data-highlights]");

        containers.forEach(function (container) {

            container.innerHTML = "";

            const highlights = content.highlights || [];

            if (!highlights.length) {
                container.appendChild(
                    createElement(
                        "p",
                        "empty-message",
                        "No highlights have been added yet."
                    )
                );

                return;
            }

            highlights.forEach(function (highlight) {

                const card = document.createElement("a");

                card.className = "highlight-card";
                card.href = highlight.link || "#";

                if (highlight.link === "#") {
                    card.addEventListener("click", function (event) {
                        event.preventDefault();
                    });
                }

                /*
                 * Background image
                 */

                if (highlight.image) {
                    card.style.backgroundImage =
                        "url('" +
                        highlight.image.replace(/'/g, "\\'") +
                        "')";
                }

                /*
                 * Dark overlay
                 */

                const overlay = createElement(
                    "div",
                    "highlight-overlay"
                );

                card.appendChild(overlay);

                /*
                 * Content
                 */

                const contentBox = createElement(
                    "div",
                    "highlight-content"
                );

                const shortName = createElement(
                    "div",
                    "highlight-short",
                    highlight.shortName || "WESTBROOK"
                );

                contentBox.appendChild(shortName);

                const title = createElement(
                    "h3",
                    "highlight-title",
                    highlight.name || "Department"
                );

                contentBox.appendChild(title);

                const description = createElement(
                    "p",
                    "highlight-description",
                    highlight.description || ""
                );

                contentBox.appendChild(description);

                const arrow = createElement(
                    "span",
                    "highlight-arrow",
                    "→"
                );

                contentBox.appendChild(arrow);

                card.appendChild(contentBox);

                container.appendChild(card);
            });
        });
    }


    /*
     * ================================
     * UPDATES
     * ================================
     */

    function renderUpdates() {
        const containers = document.querySelectorAll("[data-updates]");

        containers.forEach(function (container) {

            container.innerHTML = "";

            const updates = content.updates || [];

            if (!updates.length) {
                container.appendChild(
                    createElement(
                        "p",
                        "empty-message",
                        "No updates have been posted yet."
                    )
                );

                return;
            }

            updates.forEach(function (update) {

                const article = createElement(
                    "article",
                    "update-card"
                );

                const top = createElement(
                    "div",
                    "update-top"
                );

                const tag = createElement(
                    "span",
                    "update-tag",
                    update.tag || "Update"
                );

                const date = createElement(
                    "span",
                    "update-date",
                    update.date || ""
                );

                top.appendChild(tag);
                top.appendChild(date);

                article.appendChild(top);

                const title = createElement(
                    "h3",
                    "update-title",
                    update.title || "Update"
                );

                article.appendChild(title);

                if (update.image) {

                    const image = document.createElement("img");

                    image.src = update.image;
                    image.alt =
                        update.title ||
                        "Westbrook County update";

                    image.className = "update-image";
                    image.loading = "lazy";

                    article.appendChild(image);
                }

                if (
                    Array.isArray(update.items) &&
                    update.items.length
                ) {

                    const list =
                        document.createElement("ul");

                    list.className = "update-list";

                    update.items.forEach(function (item) {

                        const li =
                            createElement("li", "", item);

                        list.appendChild(li);
                    });

                    article.appendChild(list);
                }

                container.appendChild(article);
            });
        });
    }


    /*
     * ================================
     * SITE NAME
     * ================================
     */

    function renderSiteName() {

        document
            .querySelectorAll("[data-site-name]")
            .forEach(function (element) {

                element.textContent =
                    content.siteName ||
                    "Westbrook County";
            });
    }


    /*
     * ================================
     * LINKS
     * ================================
     */

    function renderLinks() {

        document
            .querySelectorAll("[data-discord]")
            .forEach(function (element) {

                element.href =
                    content.discordUrl || "#";
            });

        document
            .querySelectorAll("[data-roblox]")
            .forEach(function (element) {

                element.href =
                    content.robloxUrl || "#";
            });
    }


    /*
     * ================================
     * RELEASE COUNTDOWN
     * ================================
     */

    const RELEASE_TIME =
        Date.parse("2026-10-02T20:00:00Z");

    const HIDE_RIBBON_TIME =
        RELEASE_TIME +
        (24 * 60 * 60 * 1000);


    function pad(number) {

        return String(
            Math.max(0, number)
        ).padStart(2, "0");
    }


    function updateCountdown() {

        const now = Date.now();

        const days =
            document.querySelector("[data-days]");

        const hours =
            document.querySelector("[data-hours]");

        const minutes =
            document.querySelector("[data-minutes]");

        const seconds =
            document.querySelector("[data-seconds]");


        const countdownElements = [
            days,
            hours,
            minutes,
            seconds
        ];


        const hasCountdown =
            countdownElements.some(Boolean);


        if (!hasCountdown) {
            return;
        }


        if (now < RELEASE_TIME) {

            const difference =
                RELEASE_TIME - now;

            const totalSeconds =
                Math.floor(
                    difference / 1000
                );


            const d =
                Math.floor(
                    totalSeconds / 86400
                );

            const h =
                Math.floor(
                    (totalSeconds % 86400) / 3600
                );

            const m =
                Math.floor(
                    (totalSeconds % 3600) / 60
                );

            const s =
                totalSeconds % 60;


            if (days)
                days.textContent = pad(d);

            if (hours)
                hours.textContent = pad(h);

            if (minutes)
                minutes.textContent = pad(m);

            if (seconds)
                seconds.textContent = pad(s);


            document
                .querySelectorAll(
                    "[data-release-status]"
                )
                .forEach(function (element) {

                    element.textContent =
                        "COMING SOON";
                });

            return;
        }


        if (now < HIDE_RIBBON_TIME) {

            if (days)
                days.textContent = "00";

            if (hours)
                hours.textContent = "00";

            if (minutes)
                minutes.textContent = "00";

            if (seconds)
                seconds.textContent = "00";


            document
                .querySelectorAll(
                    "[data-release-status]"
                )
                .forEach(function (element) {

                    element.textContent =
                        "OUT NOW";
                });

            return;
        }


        document
            .querySelectorAll(
                "[data-countdown-ribbon]"
            )
            .forEach(function (element) {

                element.remove();
            });


        document
            .querySelectorAll(
                "[data-countdown-page]"
            )
            .forEach(function (element) {

                const message =
                    createElement(
                        "div",
                        "release-finished",
                        "Westbrook County is now live."
                    );

                element.innerHTML = "";

                element.appendChild(message);
            });
    }


    function startCountdown() {

        updateCountdown();

        setInterval(
            updateCountdown,
            1000
        );
    }


    /*
     * ================================
     * MOBILE MENU
     * ================================
     */

    function setupMobileMenu() {

        const button =
            document.querySelector(
                "[data-menu-button]"
            );

        const nav =
            document.querySelector(
                "[data-navigation]"
            );


        if (!button || !nav) {
            return;
        }


        button.addEventListener(
            "click",
            function () {

                nav.classList.toggle(
                    "open"
                );
            }
        );
    }


    /*
     * ================================
     * COUNTDOWN RIBBON
     * ================================
     */

    function setupRibbon() {

        const ribbon =
            document.querySelector(
                "[data-countdown-ribbon]"
            );


        if (!ribbon) {
            return;
        }


        const now = Date.now();


        if (now >= HIDE_RIBBON_TIME) {

            ribbon.remove();

            return;
        }


        ribbon.addEventListener(
            "click",
            function () {

                window.location.href =
                    "/pages/countdown.html";
            }
        );


        ribbon.addEventListener(
            "keydown",
            function (event) {

                if (
                    event.key === "Enter" ||
                    event.key === " "
                ) {

                    event.preventDefault();

                    window.location.href =
                        "/pages/countdown.html";
                }
            }
        );
    }


    /*
     * ================================
     * START
     * ================================
     */

    document.addEventListener(
        "DOMContentLoaded",
        function () {

            renderSiteName();

            renderLinks();

            renderHighlights();

            renderUpdates();

            setupRibbon();

            setupMobileMenu();

            startCountdown();
        }
    );

})();
