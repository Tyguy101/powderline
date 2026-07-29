# Powderline development and deployment

## Local development

The normal command is:

```bash
npm run dev
```

Vite uses a fixed port (`5173`), binds to `0.0.0.0`, and keeps hot-module
replacement enabled. It prints a loopback URL and each available LAN URL:

```text
Local:   http://localhost:5173/
Network: http://192.168.x.x:5173/
```

On Windows, approve the Node.js firewall prompt for **Private networks**. Do
not enable Public networks. If the prompt was previously denied, open
**Windows Security → Firewall & network protection → Allow an app through
firewall**, then allow the installed Node.js runtime on Private networks.

### LAN WebGPU and HTTPS

WebGPU is restricted to secure contexts. Browsers make a development exception
for loopback addresses such as `http://localhost`, but not for another
computer's private-IP HTTP origin. Therefore:

- `http://localhost:5173/` can use WebGPU on the development computer.
- `http://192.168.x.x:5173/` is useful for reachability and UI testing, but
  WebGPU is normally unavailable on a phone or tablet.
- `npm run dev:https` serves the same HMR development build over HTTPS.

The HTTPS command uses Vite's basic SSL plugin. Its certificate is self-signed.
Each device must explicitly trust that certificate/issuer before the origin is
a valid secure context; bypassing a certificate warning alone may not enable
WebGPU. For routine phone testing, the trusted HTTPS Vercel deployment is often
more practical.

Do not use browser flags that weaken secure-context checks as a project
workaround.

## Production build

```bash
npm ci
npm run lint
npm test
npm run build
```

The project is a normal static Vite application:

- Build command: `npm run build`
- Output directory: `dist`
- Server functions: none
- Required secrets: none

`vercel.json` records those values explicitly. A failed Vercel build does not
replace the last successful production deployment.

## GitHub and Vercel workflow

Use one GitHub repository and one persistent Vercel project named
`powderline`.

1. Connect the GitHub repository to the Vercel project once.
2. Configure `main` as the production branch.
3. Pushes to `main` build and update the stable production domain.
4. Other branches and pull requests may receive preview deployments.
5. Preview URLs are disposable and must not be published as the permanent game
   address.

Vercel automatically deploys connected Git branches. Successful `main` builds
replace production; failed builds leave the current production deployment
serving.

## Build identity

Vercel supplies `VERCEL_GIT_COMMIT_SHA`. Vite embeds its first eight characters
in the game. Local builds use `git rev-parse --short=8 HEAD`. The identifier is
visible in the bottom-left status chip and exposed in the runtime metrics.

## Future arcade hosting

The current build assumes `/` by default, which works for a dedicated domain
such as:

```text
https://powderline.example.com/
```

For a path deployment such as:

```text
https://example.com/games/powderline/
```

build with:

```bash
$env:VITE_BASE_PATH="/games/powderline/"
npm run build
```

On macOS/Linux, use:

```bash
VITE_BASE_PATH=/games/powderline/ npm run build
```

The value must start and end with `/`. Powderline uses Vite-resolved asset URLs
and does not require a backend, so the static output can later be copied into an
arcade portal at either location.

## Retired Cloudflare workflow

The temporary Worker workflow has been removed:

- No Wrangler dependency or deploy script
- No Cloudflare Vite plugin
- No Worker wrapper build
- No `wrangler deploy --temporary` instructions

The `.openai/hosting.json` file is unrelated Codex Sites metadata and remains in
the repository; it is not used by local Vite or Vercel.
