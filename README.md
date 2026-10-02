# Westbrook County — working website

## IMPORTANT FILE STRUCTURE

Upload the **contents of this folder** to the root of your GitHub repository. Do not upload the outer folder itself.

```text
index.html
admin.html
assets/
  css/
    styles.css
  js/
    app.js
    content.js
  images/
    westbrook-logo.png
pages/
  updates.html
  liveries.html
```

`index.html` MUST be at the root of the GitHub repository.

## Editing the website

There are two easy options:

### Option 1 — Edit Site page
Open `/admin.html` on your site.

Change homepage text, release time, livery link, highlights and updates. For updates, enter one bullet point per line.

Click **Save & preview** to keep the changes in this browser.

Click **Download content.js**, then replace:

`assets/js/content.js`

in GitHub with the downloaded file.

Cloudflare Pages will then redeploy the changes.

### Option 2 — Edit content.js directly
All editable content is in:

`assets/js/content.js`

Do not edit `assets/js/app.js` or `assets/css/styles.css` unless you are changing the site's functionality/design.

## Update format

An update looks like:

```js
{
  date: "02 October 2026",
  title: "New Vehicles",
  tag: "Vehicles",
  image: "assets/images/vehicles.jpg",
  items: [
    "Ford Mustang",
    "BMW 5 Series",
    "Updated emergency lighting"
  ]
}
```

The website automatically displays the title followed by the bullet list.

## Images

Put update images in:

`assets/images/`

Then set the path, for example:

`image: "assets/images/vehicles.jpg"`

Leave it as `""` for no image.

## Cloudflare Pages

Framework: None
Build command: blank
Build output directory: `.`

Make sure `index.html` is at the repository root.
