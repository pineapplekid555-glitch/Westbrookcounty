# Westbrook County Website

Easy-to-edit static site for GitHub + Cloudflare Pages.

## Edit the main information
Open `site-config.js`.

## Add updates
Open `updates.js`. Add a new object at the top of `UPDATES`.

For pictures, put files in `assets/images/` and use a path such as:
`assets/images/police-vehicles.jpg`

## Countdown
Release is set to 2 October 2026 at 9:00 PM. The countdown becomes a live message at release and removes itself from the page 24 hours later. It does not delete GitHub/Cloudflare files; it removes the countdown element in the browser.

## Cloudflare Pages
Framework: None
Build command: blank
Build output directory: `.`
Keep `index.html` in the repository root.
