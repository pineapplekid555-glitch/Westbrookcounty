(function () {
    "use strict";

    const content = window.WESTBROOK_CONTENT || {};

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
     * HIGHLIGHTS (department cards)
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

                card.className = "highlight-card reveal";
                card.href = highlight.link || "#";

                if (!highlight.link || highlight.link === "#") {
                    card.addEventListener("click", function (event) {
                        event.preventDefault();
                    });
                }

                if (highlight.image) {
                    const img = document.createElement("img");

                    img.className = "highlight-img";
                    img.src = highlight.image;
                    img.alt = highlight.name || "Westbrook County";
                    img.loading = "lazy";
                    img.decoding = "async";

                    card.appendChild(img);
                }

                card.appendChild(createElement("div", "highlight-overlay"));

                const contentBox = createElement("div", "highlight-content");

                contentBox.appendChild(
                    createElement(
                        "div",
                        "highlight-short",
                        highlight.shortName || "WESTBROOK"
                    )
                );

                contentBox.appendChild(
                    createElement(
                        "h3",
                        "highlight-title",
                        highlight.name || "Department"
                    )
                );

                contentBox.appendChild(
                    createElement(
                        "p",
                        "highlight-description",
                        highlight.description || ""
                    )
                );

                card.appendChild(contentBox);

                card.appendChild(
                    createElement("span", "highlight-arrow", "→")
                );

                container.appendChild(card);
            });
        });
    }


    /*
     * ================================
     * UPDATES
     * ================================
     *
     * <div data-updates data-limit="1"> only shows the newest
     * update (used on the home page). No data-limit = show all.
     */

    function renderUpdates() {
        const containers = document.querySelectorAll("[data-updates]");

        containers.forEach(function (container) {

            container.innerHTML = "";

            let updates = content.updates || [];

            const limit = parseInt(
                container.getAttribute("data-limit"),
                10
            );

            if (limit > 0) {
                updates = updates.slice(0, limit);
            }

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
                    "update-card reveal"
                );

                const top = createElement("div", "update-top");

                const tagText = update.tag || "Update";

                const tag = createElement(
                    "span",
                    "update-tag" +
                        (/release/i.test(tagText) ? " tag-release" : ""),
                    tagText
                );

                const date = createElement(
                    "span",
                    "update-date",
                    update.date || ""
                );

                top.appendChild(tag);
                top.appendChild(date);

                article.appendChild(top);

                article.appendChild(
                    createElement(
                        "h3",
                        "update-title",
                        update.title || "Update"
                    )
                );

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

                    const list = document.createElement("ul");

                    list.className = "update-list";

                    update.items.forEach(function (item) {
                        list.appendChild(
                            createElement("li", "", item)
                        );
                    });

                    article.appendChild(list);
                }

                container.appendChild(article);
            });
        });
    }


    /*
     * ================================
     * GALLERY + LIGHTBOX
     * ================================
     */

    function setupLightbox() {

        let box = document.querySelector(".lightbox");

        if (box) {
            return box;
        }

        box = createElement("div", "lightbox");
        box.setAttribute("role", "dialog");
        box.setAttribute("aria-label", "Image preview");

        const img = document.createElement("img");
        img.alt = "";

        const close = createElement("button", "lightbox-close", "×");
        close.type = "button";
        close.setAttribute("aria-label", "Close preview");

        box.appendChild(img);
        box.appendChild(close);
        document.body.appendChild(box);

        function hide() {
            box.classList.remove("open");
            img.removeAttribute("src");
        }

        box.addEventListener("click", hide);

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape") {
                hide();
            }
        });

        box.show = function (src, alt) {
            img.src = src;
            img.alt = alt || "";
            box.classList.add("open");
        };

        return box;
    }

    function renderGallery() {
        const containers = document.querySelectorAll("[data-gallery]");

        if (!containers.length) {
            return;
        }

        const lightbox = setupLightbox();

        containers.forEach(function (container) {

            container.innerHTML = "";

            (content.gallery || []).forEach(function (item) {

                const figure = createElement(
                    "figure",
                    "gallery-item reveal" +
                        (item.size ? " " + item.size : "")
                );

                const img = document.createElement("img");

                img.src = item.image;
                img.alt = item.caption || "Westbrook County";
                img.loading = "lazy";
                img.decoding = "async";

                figure.appendChild(img);

                if (item.caption) {
                    figure.appendChild(
                        createElement("figcaption", "", item.caption)
                    );
                }

                figure.addEventListener("click", function () {
                    lightbox.show(item.image, item.caption);
                });

                container.appendChild(figure);
            });
        });
    }


    /*
     * ================================
     * LIVE ROBLOX STATS (hero strip)
     * ================================
     *
     * Reads /api/stats (Cloudflare function). If it fails for
     * any reason the strip simply stays hidden.
     */

    function formatNumber(value) {
        try {
            return Number(value).toLocaleString("en-GB");
        } catch (error) {
            return String(value);
        }
    }

    function countUp(element, target) {

        const duration = 1100;
        const start = performance.now();

        function frame(now) {

            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);

            element.textContent = formatNumber(
                Math.round(target * eased)
            );

            if (progress < 1) {
                requestAnimationFrame(frame);
            }
        }

        requestAnimationFrame(frame);
    }

    function renderStats() {
        const strip = document.querySelector("[data-stats]");

        if (!strip || !window.fetch) {
            return;
        }

        fetch("/api/stats", { cache: "no-store" })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error("stats unavailable");
                }
                return response.json();
            })
            .then(function (data) {

                if (!data || data.error) {
                    throw new Error("stats unavailable");
                }

                ["playing", "visits", "likes", "favorites"].forEach(
                    function (key) {
                        const el = strip.querySelector(
                            '[data-stat="' + key + '"]'
                        );

                        if (el && typeof data[key] === "number") {
                            countUp(el, data[key]);
                        }
                    }
                );

                strip.hidden = false;
            })
            .catch(function () {
                strip.hidden = true;
            });
    }


    /*
     * ================================
     * SITE NAME + LINKS
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
     * HEADER: mobile menu + scroll state
     * ================================
     */

    function setupHeader() {

        const header = document.querySelector(".site-header");
        const button = document.querySelector("[data-menu-button]");
        const nav = document.querySelector("[data-navigation]");

        if (button && nav) {

            button.addEventListener("click", function () {
                const open = nav.classList.toggle("open");
                button.setAttribute("aria-expanded", String(open));
            });

            nav.addEventListener("click", function (event) {
                if (event.target.closest("a")) {
                    nav.classList.remove("open");
                    button.setAttribute("aria-expanded", "false");
                }
            });
        }

        if (header) {

            function onScroll() {
                header.classList.toggle("scrolled", window.scrollY > 8);
            }

            onScroll();
            window.addEventListener("scroll", onScroll, { passive: true });
        }
    }


    /*
     * ================================
     * REVEAL ON SCROLL
     * ================================
     */

    function setupReveal() {

        const items = document.querySelectorAll(".reveal");

        if (!("IntersectionObserver" in window)) {
            items.forEach(function (item) {
                item.classList.add("in");
            });
            return;
        }

        const observer = new IntersectionObserver(
            function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("in");
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.12 }
        );

        items.forEach(function (item) {
            observer.observe(item);
        });
    }


    /*
     * ================================
     * START
     * ================================
     */

    document.addEventListener("DOMContentLoaded", function () {

        renderSiteName();
        renderLinks();

        renderHighlights();
        renderUpdates();
        renderGallery();

        setupHeader();
        setupReveal();

        renderStats();
    });

})();
