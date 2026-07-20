# Root Cause Found

BAGIDEA exists in the characters table:
- user_id: 1e307a9d-b0b5-4f47-890a-413d7817d424
- level: 42, job: priest

The `fetchPublicCharacter(userId)` function queries by `user_id`. So it SHOULD work if the server sends the correct UUID as userId.

But the server sends `info.userId` in the `players_global` payload. Let me check if the server's userId for BAGIDEA is the actual Supabase user UUID or something else.

In server.js line 319:
```
userId,  // This comes from the client's join payload
```

And line 288:
```
let { userId, username, level } = data;
```

Then line 298-299:
```
if (!error && u && u.user) { userId = u.user.id; verified = true; }
```

So if the client provides a valid access token, the server uses the actual Supabase UUID. If not, it uses whatever the client sent.

The issue might be that the `userId` in the `onlinePlayers` array (from players_global) is correct, but `fetchPublicCharacter` is failing for a different reason.

Let me check: maybe the issue is that `isOfflineMode` is true, or `supabase` is null at the time of the call.
