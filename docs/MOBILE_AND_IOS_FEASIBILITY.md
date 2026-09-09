# Powderline mobile foundation and iOS feasibility

## Product recommendation

Powderline should be **landscape-first and portrait-supported**. Portrait remains
playable and useful for casual browser sessions, but the current camera exposes
about 43 world units laterally at a 390×844 viewport versus about 173 in an
844×390 landscape viewport. Obstacles are therefore easier to read and route
around in landscape. Do not lock browser orientation; reassess a native lock
only after physical iPad windowing and iPhone tests.

Use two release tracks:

1. Ship and test the HTTPS browser build as a Safari/Home Screen web app.
2. When the browser product is mature, run an isolated **Capacitor 8** packaging
   spike. Bundle `dist` locally with `webDir: "dist"`; do not make a production
   wrapper that merely opens the Vercel URL.

The practical Apple minimum is iOS/iPadOS 26 because Powderline intentionally
has no WebGL fallback and WebGPU became available by default in Safari 26.
Capacitor is a packaging recommendation, not yet a committed production
dependency. A physical-device WKWebView gate is required before choosing it.

## Evidence and platform facts

- WebGPU is enabled by default in Safari 26 on iOS, iPadOS, macOS, and visionOS,
  and WebKit identifies Three.js as a compatible framework:
  <https://webkit.org/blog/17333/webkit-features-in-safari-26-0/#webgpu>
- Apple describes WebGPU as mapping closely to Metal:
  <https://developer.apple.com/videos/play/wwdc2025/236/>
- Capacitor 8 requires Node 22, macOS, and Xcode 26 or newer for iOS work, and
  its iOS runtime is WKWebView:
  <https://capacitorjs.com/docs/getting-started/environment-setup>
  and <https://capacitorjs.com/docs/ios>
- Capacitor production content should use the compiled `webDir`; `server.url`
  is for live reload rather than a shipped remote shell:
  <https://capacitorjs.com/docs/config>
- App Review guideline 4.2 requires lasting value beyond a repackaged website:
  <https://developer.apple.com/app-store/review/guidelines/#minimum-functionality>

## Browser and wrapper behavior to preserve

- Feature-detect `navigator.gpu`; do not infer support from user agent strings.
- Pause and clear held input on focus loss/backgrounding. Stop the render loop
  while hidden, reset fixed-step time on return, and require an explicit resume.
- Keep `touch-action: none` on the game surface, single-pointer ownership, and
  deterministic normalized input. System edge gestures still require physical
  testing.
- Use `viewport-fit=cover`, CSS safe-area variables, dynamic viewport height,
  and responsive resizing. Do not depend on arbitrary element fullscreen on
  iPhone Safari.
- Keep browser Gamepad API support first. If it is unreliable in WKWebView, a
  small Capacitor bridge to Apple's Game Controller framework can still feed the
  existing normalized input state without changing replay format.
- Future audio must be activated by an explicit user gesture and suspended on
  backgrounding.
- Do not treat WKWebView localStorage/IndexedDB as durable product storage.
  Small settings should later use Capacitor Preferences; larger replay history
  can use Filesystem or SQLite only when needed.

## Windows-to-App-Store toolchain

Windows remains sufficient for gameplay, deterministic tests, Vite builds,
browser benchmarks, Git, and Vercel. It cannot compile, sign, archive, or submit
an iOS app.

The native phase will require:

- macOS with Xcode 26 or newer;
- an Apple Developer Program membership;
- a permanent bundle identifier, certificates, signing, and provisioning;
- App Store Connect and TestFlight;
- physical iPhone and iPad hardware for WebGPU, controller, audio, thermal,
  battery, memory, and lifecycle validation.

The least painful workflow is a small local or remotely accessible Mac for
interactive Xcode/Web Inspector/device debugging, with GitHub Actions or Xcode
Cloud for repeatable builds after the initial project/signing setup. Cloud build
services do not replace physical debugging. Xcode Cloud setup itself initially
requires Xcode. Do not purchase or configure a service until the Capacitor spike
passes its physical-device gate.

## Native packaging go/no-go gate

Before merging any wrapper into `main`, prove on physical iPhone and iPad:

- `navigator.gpu.requestAdapter()` and device creation succeed in WKWebView;
- every Three.js TSL pipeline compiles without validation errors;
- sustained P95/P99 frame pacing, memory, heat, and battery are acceptable;
- background/resume either preserves the device or recreates resources cleanly;
- touch, Xbox/PlayStation controllers, disconnect/reconnect, and deterministic
  replay remain correct;
- safe areas, rotation, iPad resizing, offline launch, storage, and future audio
  interruption recovery behave correctly;
- Sentry receives JavaScript/native failures without replay inputs or PII.

No wrapper proof-of-concept was created in this milestone because current
documentation answers the architecture question; the decisive remaining facts
require a Mac and physical Apple devices, not another Windows-side scaffold.

