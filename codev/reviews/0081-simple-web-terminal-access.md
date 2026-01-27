# Review: Spec 0081 - Simple Web Terminal Access

**PR**: #169
**Branch**: `builder/0081-simple-web-terminal-access`
**Status**: Ready for architect review

## Summary

Implemented remote web-based access to Agent Farm terminals via the Tower dashboard. Users can now access builder terminals from any device (phones, tablets, remote machines) through a secure tunnel.

## Implementation Highlights

### Phase 1: Reverse Proxy
- Added HTTP and WebSocket proxy to tower-server.ts
- Routes via `/project/<base64url-path>/<terminal-type>/*`
- Base64URL encoding (RFC 4648) for path safety
- Terminal routing: dashboard (base_port), architect (+1), builder (+2+n)

### Phase 2: Auth Layer
- Timing-safe token comparison using `crypto.timingSafeEqual`
- Auth required when `CODEV_WEB_KEY` is set (no localhost bypass)
- Login page for browser requests, 401 for API requests
- WebSocket auth via `Sec-WebSocket-Protocol: auth-<key>` with stripping
- `codev web keygen` command for key generation

### Phase 3: Tunnel Integration
- `codev web tunnel` command with setup instructions
- Created `codev/resources/tunnel-setup.md` documentation
- Covers cloudflared (recommended), ngrok, Tailscale Funnel

### Phase 4: Push Notifications
- SSE (Server-Sent Events) infrastructure for real-time updates
- `/api/events` endpoint for client subscription
- `/api/notify` endpoint for builders to POST completion messages
- Browser notifications with in-app toast fallback

### Phase 5: Mobile Polish
- Viewport meta tags for notched devices (iPhone X+)
- Safe area insets for headers, content, toasts
- Responsive CSS for screens < 600px
- Touch-friendly tap targets (44px minimum)

## Test Results

```
Test Files  15 passed (15)
Tests       211 passed (211)
```

All agent-farm tests pass, including 35 new tower-proxy tests covering:
- Base64URL encoding/decoding
- Terminal port routing
- Path validation
- Auth helpers
- WebSocket auth protocol parsing

## Files Changed

| File | Changes |
|------|---------|
| `tower-server.ts` | +408 lines (proxy, auth, SSE) |
| `tower.html` | +343 lines (auth, SSE, mobile CSS) |
| `cli.ts` | +72 lines (web keygen, web tunnel) |
| `tower-proxy.test.ts` | +225 lines (new test file) |
| `tunnel-setup.md` | +182 lines (new docs) |

## Security Considerations

1. **No localhost bypass**: When `CODEV_WEB_KEY` is set, ALL requests require auth because tunnel daemons run locally and proxy remote traffic.

2. **Timing-safe comparison**: API keys compared using `crypto.timingSafeEqual` to prevent timing attacks.

3. **WebSocket auth stripping**: `auth-<key>` protocol stripped before forwarding to ttyd to avoid confusing upstream servers.

4. **Base64URL encoding**: Project paths encoded to avoid issues with slashes and special characters.

## What Went Well

- Clean separation of phases made implementation straightforward
- SSE with fetch+ReadableStream works around EventSource's lack of header support
- Mobile CSS using `env(safe-area-inset-*)` handles modern devices well

## Lessons Learned

1. **EventSource limitation**: `EventSource` doesn't support custom headers, requiring fetch with ReadableStream for authenticated SSE.

2. **Base64URL vs URL encoding**: Initially considered URL encoding, but Base64URL (RFC 4648) is cleaner and more compact.

3. **No localhost bypass is critical**: Tunnel daemons run locally, so checking `remoteAddress` would incorrectly trust remote traffic routed through the tunnel.

## Open Questions for Architect

1. Should we add rate limiting to `/api/notify` endpoint?
2. Should SSE connections require auth even when `CODEV_WEB_KEY` is not set?
3. Is the mobile breakpoint (600px) appropriate for the use case?

## Next Steps

After merge:
- Test with actual cloudflared tunnel in production
- Verify mobile experience on iOS and Android devices
- Consider adding PWA manifest for "Add to Home Screen" support
