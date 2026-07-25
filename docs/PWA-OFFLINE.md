# PWA and offline policy

The service worker pre-caches only `/`, the manifest and declared icons. It ignores queries and never caches `/app`, `/api`, invitation, response, export or authenticated content. New workers wait until the application explicitly sends `SKIP_WAITING`; a controller change reloads once.

No child identifiers, attendance, messages, medical/safeguarding content, payments, consent, exports or authentication material are stored in Cache Storage or a durable background queue. Production attendance requires a connection. Only non-sensitive preferences such as UI density may be queued offline. Failed writes remain explicit rather than pretending to have synced.

Operators should test install, update, offline public shell, storage clearing and reduced motion on supported browsers. “Installable” does not imply every feature works offline.
