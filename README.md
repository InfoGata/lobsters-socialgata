# lobsters-socialgata

A [SocialGata](https://github.com/InfoGata/socialgata) plugin for [Lobsters](https://lobste.rs/).

## Features

- Browse the Hottest and Newest feeds
- View stories with nested comment threads
- View user profiles and their submitted stories

No authentication required.

## Installation

Install via the SocialGata UI by adding the manifest URL:

```
https://cdn.jsdelivr.net/gh/InfoGata/lobsters-socialgata@latest/manifest.json
```

## Development

```sh
npm install
npm run build
```

This produces `dist/index.js`. To develop locally against a running SocialGata
webapp, serve this directory with CORS enabled and install the plugin from the
local manifest URL:

```sh
npx serve . -p 8081 --cors
```

Then in SocialGata, add the plugin from `http://localhost:8081/manifest.json`.

## License

MIT
