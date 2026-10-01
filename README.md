# Westbrook County Website

## Uploading to GitHub

Keep this structure:

- index.html
- site-config.js
- updates.js
- assets/
- pages/

Do not move `index.html` out of the repository root.

## Adding an update

Open `updates.js`.

Newest updates go at the top:

{
  date: "02 October 2026",
  title: "New Map",
  tag: "Map",
  image: "assets/images/map.jpg",
  items: [
    "New county layout",
    "New roads",
    "New locations"
  ]
}

The `items` automatically become bullet points underneath the update title.

If you do not want an image:
image: ""

## Adding an image

Put the image into:

assets/images/

Then use its path in `updates.js`.

## Changing the release date

Edit `releaseAt` in `site-config.js`.

Example:
releaseAt: "2026-10-02T21:00:00+01:00"

The countdown uses the explicit timestamp and updates every second.

After release, it displays "Westbrook County is live." and removes itself 24 hours later.

## Custom Liveries

The Custom Liveries page uses the Google Drive folder configured in `site-config.js`.

Change:
links.liveries

if the folder ever changes.

## Roblox and Discord

Set these in `site-config.js`:

links: {
  roblox: "YOUR_LINK",
  discord: "YOUR_LINK",
  liveries: "YOUR_GOOGLE_DRIVE_LINK"
}

## Cloudflare Pages

Build command: leave blank.
Build output directory: .
Framework preset: None.
