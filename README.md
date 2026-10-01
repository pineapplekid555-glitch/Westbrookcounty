# Westbrook County Website

Static website designed for GitHub + Cloudflare Pages.

## Files you normally edit

### `site-config.js`
Change:
- Site name
- Release date/time
- Roblox link
- Discord link
- Google Drive livery link
- Homepage text
- Homepage information cards

### `updates.js`
This controls the update log.

Add new updates at the **top** of `UPDATES` so the newest post appears first.

Example:

```js
{
  date: "01 October 2026",
  title: "New vehicles",
  text: "Added new county vehicles and updated the emergency fleet.",
  image: "assets/images/vehicles.jpg",
  tag: "Development"
}
```

### Adding update pictures

1. Put the picture in `assets/images/`.
2. Set the `image` value to `assets/images/filename.jpg`.
3. Commit/push to GitHub.
4. Cloudflare Pages will redeploy automatically.

If an update has no picture, leave `image: ""`.

## Countdown

The release timestamp is stored as `2026-10-02T20:00:00Z`.

The countdown:
- counts down to the release moment;
- changes to `Westbrook County is live.` when released;
- removes itself 24 hours later.

## Deployment

For Cloudflare Pages:
- Framework preset: None
- Build command: blank
- Build output directory: `.`
- Production branch: `main`

`index.html` must remain at the repository root.

## Adding update lists

Open `updates.js`. Add a new update at the top of `UPDATES` using `items` for the bullet list:

```js
{
  date: "01 October 2026",
  title: "New Vehicles",
  items: [
    "Ford Mustang",
    "BMW 5 Series",
    "Updated emergency lighting"
  ],
  image: "assets/images/vehicles.jpg",
  tag: "Vehicles"
}
```

Each item in `items` becomes a separate bullet underneath the update title.
