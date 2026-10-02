# Westbrook County — fixed website

This build is self-contained so the pages keep their layout even if a CSS or JS asset is accidentally omitted during upload. The normal CSS/JS files are still included for organisation and editing.

## Deploy
Upload/push the ENTIRE folder contents to the GitHub repository — not just index.html. Keep `assets`, `pages`, and `functions` at the repository root beside `index.html`. Cloudflare Pages should use branch `main`, no build command, and output directory `.`.

## Edit updates
Only edit `assets/js/content.js`. Visitors have no editor and cannot change the site. Put the newest update first.

## Real Roblox stats
Set `robloxUniverseId` in `assets/js/content.js` to the real Roblox universe ID. No fake stats are used.

## Custom Liveries
The Custom Liveries page opens the configured Google Drive library.
