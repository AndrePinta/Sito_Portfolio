# Andrea Pintauro — Portfolio

Static portfolio built with HTML, CSS and JavaScript. Project images and videos are served from the public Cloudflare R2 custom domain `mediaz.andreapintauro.com`; the copies in `assets/media/` are local fallbacks.

The desktop navigation logo uses `Risorsa 5.svg` from R2 with a local fallback; mobile logos are unchanged. The wide desktop browse-all layout reserves three caption lines when centering the project row, keeping it stationary as captions change. When available width or height requires it, desktop uses normal document flow with reserved caption space and 72px around the project row; footer items stack only when their horizontal space is insufficient. In the desktop project list, the email sits above the bio, clear of the scrolling artwork. Mobile retains the contact heading and email above the SVG bio header, and horizontally scrollable panoramas offer a brief motion hint when entering view unless reduced motion is enabled.

## Development

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:4173/`. Project routes such as `/projects/dish-list` are served directly as well.

## Tests

```sh
npm test
```

With the development server running, `npm run test:browser` runs the browser smoke test; it requires a Playwright Chromium installation.

## Structure

- `assets/css/`, `assets/js/`, `assets/fonts/`, `assets/media/`: site assets
- `crane/`: interactive crane header and physics modules
- `crane/vendor/`: Matter.js browser bundle and license
- `scripts/`: local development server
- `tests/`: physics and browser smoke tests

Cloudflare Pages deployments use `_redirects` to send client-side project routes to `index.html`.
