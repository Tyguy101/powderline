# Mobile

Powderline is landscape-first and portrait-supported. Drag horizontally to
steer, upward to brake, and downward to tuck; diagonal drags combine actions.
One primary pointer owns the gesture so a second finger cannot hijack steering.

The game surface suppresses scrolling, selection, callouts, and touch gestures.
HUD layout uses safe-area insets and dynamic viewport height, with 44 px pause,
resume, crash, and restart targets. Backgrounding clears held input, stops the
render loop, and returns to an explicit resume prompt without fixed-step catch-up.

See [docs/PHYSICAL_DEVICE_QA.md](./docs/PHYSICAL_DEVICE_QA.md) for local HTTPS
and real-device testing, and
[docs/MOBILE_AND_IOS_FEASIBILITY.md](./docs/MOBILE_AND_IOS_FEASIBILITY.md) for
the App Store packaging recommendation and unresolved iOS questions.
