# Westbrook County — final website

## Important

There is NO public website editor/admin page in this version.

Visitors cannot edit the website.

To change content, edit `assets/js/content.js` in your GitHub repository and commit the change. Cloudflare Pages will then deploy the new version.

## Folder structure

index.html
assets/
  css/styles.css
  js/app.js
  js/content.js
  images/westbrook-logo.png
  images/favicon.png
pages/
  updates.html
  liveries.html
functions/
  api/stats.js

## Updates

Edit `assets/js/content.js`:

updates: [
  {
    date: "02 October 2026",
    title: "New Map",
    tag: "Map",
    image: "",
    items: [
      "New road",
      "New station",
      "New location"
    ]
  }
]

Put the newest update first.

## Real Roblox stats

This version does NOT use made-up numbers.

Set `robloxUniverseId` in `assets/js/content.js` to the game's Roblox universe ID.

The Cloudflare Pages Function `/api/stats` then reads live data from Roblox and displays:
- players currently playing
- total visits
- likes
- favourites

If no universe ID is set, the site shows a message instead of fake stats.

## Browser/search-bar logo

`assets/images/favicon.png` is generated from the supplied Westbrook County logo and is referenced by every page as the favicon. Browsers decide how/when to display favicons, so the browser may cache the old icon until the site is refreshed or the cache expires.

## Cloudflare Pages

Framework preset: None
Build command: blank
Build output directory: `.`

The `functions` directory must remain at the repository root so Cloudflare Pages Functions can deploy `/api/stats`.
