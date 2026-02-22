# QA Matrix (iOS + Android)

## Device matrix

- iPhone SE (small screen, iOS latest - 1)
- iPhone 15/16 class (dynamic island, latest iOS)
- iPad (landscape + split view)
- Pixel 7/8 (Android latest)
- Samsung Galaxy S series (OneUI latest)
- Low-memory Android device (3-4 GB RAM)

## Core scenarios

- First launch: name entry + consent required + first mission guide
- Start/restart flow with no duplicate taps
- Session from start to game over, leaderboard update, streak update
- Offline mode: run completes with queued sync
- Reconnect mode: queued run sync flushes and leaderboard updates
- Background/foreground: no timer exploits, no crashes
- Orientation and safe-area behavior

## Performance profiling

- CPU frame pacing at 60 FPS target (5-minute run)
- Memory growth across 10 consecutive runs
- Battery drain test (15-minute continuous session)
- Thermal throttling behavior

## Reliability

- Force-close app during run and reopen
- Kill network mid-run then finish
- Corrupt localStorage simulation and recovery behavior
- Backend unreachable/slow timeout behavior

## Acceptance criteria

- No crash in 100-run monkey touch test
- No gameplay-blocking UI overlap on notch devices
- Run finish always records locally even when offline
- Server-authoritative score differs when client lies
