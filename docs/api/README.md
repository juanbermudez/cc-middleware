# CC-Middleware API Reference

Base URL: `http://127.0.0.1:3000`

## Health & Status

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/v1/status` | Middleware status |

## Sessions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/sessions` | List sessions |
| GET | `/api/v1/sessions/:id` | Get session details |
| GET | `/api/v1/sessions/:id/messages` | Get messages (paginated) |
| POST | `/api/v1/sessions` | Launch new session |
| POST | `/api/v1/sessions/:id/resume` | Resume session |
| POST | `/api/v1/sessions/:id/abort` | Abort active session |
| PUT | `/api/v1/sessions/:id` | Update session (rename/tag) |

## Events

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/events/types` | List event types |
| POST | `/api/v1/events/subscribe` | Register webhook |
| GET | `/api/v1/events/subscriptions` | List subscriptions |
| DELETE | `/api/v1/events/subscriptions/:id` | Remove subscription |

## Agents

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/agents` | List agents |
| GET | `/api/v1/agents/:name` | Get agent details |
| POST | `/api/v1/agents` | Register runtime agent |
| DELETE | `/api/v1/agents/:name` | Remove runtime agent |

## Teams

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/teams` | List teams |
| GET | `/api/v1/teams/:name` | Get team details |
| GET | `/api/v1/teams/:name/tasks` | Get team tasks |

## Permissions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/permissions/policies` | List policies |
| POST | `/api/v1/permissions/policies` | Add policy rule |
| DELETE | `/api/v1/permissions/policies/:id` | Remove rule |
| GET | `/api/v1/permissions/pending` | Pending requests |
| POST | `/api/v1/permissions/pending/:id/resolve` | Resolve request |
| GET | `/api/v1/permissions/questions` | Pending questions |
| POST | `/api/v1/permissions/questions/:id/answer` | Answer question |

## Search

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/search` | Search sessions |
| POST | `/api/v1/search/reindex` | Trigger reindex |
| GET | `/api/v1/search/stats` | Index statistics |

## WebSocket

Connect to: `ws://127.0.0.1:3000/api/v1/ws`

### Client Messages
```json
{ "type": "subscribe", "events": ["session:*", "hook:PreToolUse"] }
{ "type": "unsubscribe", "events": ["hook:PreToolUse"] }
{ "type": "launch", "options": { "prompt": "...", "allowedTools": [...] } }
{ "type": "resume", "sessionId": "...", "prompt": "..." }
```

### Server Messages
```json
{ "type": "session:started", "sessionId": "...", "timestamp": 0 }
{ "type": "session:stream", "sessionId": "...", "event": { "type": "text_delta", "text": "..." } }
{ "type": "session:completed", "sessionId": "...", "result": { ... } }
{ "type": "session:errored", "sessionId": "...", "error": "..." }
{ "type": "hook:event", "eventType": "PreToolUse", "input": { ... } }
{ "type": "permission:pending", "permission": { "id": "...", "toolName": "..." } }
{ "type": "question:pending", "question": { "id": "...", "questions": [...] } }
```

---

*This document is updated as the API is implemented. See phase docs for planned but not-yet-implemented endpoints.*
