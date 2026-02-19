# Spec 443: Show Machine Hostname in Dashboard

## Status: stub

Stub spec for the builder to flesh out. See GitHub Issue #443.

## Summary

When accessing the dashboard remotely (via cloud.codevos.ai), display the machine's hostname in the dashboard header to distinguish which machine you're connected to.

- Local access: "Codev Tower" (or "Localhost Codev Tower")
- Remote access: "<Hostname> Codev Tower" (e.g., "Mac Codev Tower")

Tower knows its hostname via `os.hostname()`. Dashboard needs to receive and display it.
