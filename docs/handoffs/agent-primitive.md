# Agent primitive — handoff for implementation

*Status: design complete, ready for v0 build. Author: Julia + assistant (2026-05-13).*

A barebones primitive for **named, addressable, durable agents** inside
Mycelium rooms. Designed to leverage existing Mycelium primitives (rooms,
memory, addressed messages, adapters) rather than invent new ones.

The use case driving the design: Julia keeps a long-lived Claude Code
session whose only job is "cut releases of mycelium-cli." She pings it
about 8× a week with `"im back, do the release."` It runs ~7 commands and
reports success or failure. This pattern works, but it's currently ad-hoc
(one terminal, one session, manually invoked by her). This primitive
formalizes that pattern so:

- Any agent can be defined once, then addressed by handle from anywhere
- Other agents (her main coding session, an `@docs-agent`, a CI hook) can
  invoke it via the existing room-message bus
- Its persistent identity + accumulated knowledge live in Mycelium memory,
  not in a Claude Code session UUID
- The same mechanism that powers OpenClaw `@handle` mentions today powers
  Claude Code `@handle` mentions tomorrow

---

## What this is NOT

These got walked back from earlier supervisor-mode sketches. Don't
reintroduce them without an explicit conversation:

- **No negotiation / sessions / CognitiveEngine routing.** Agents
  don't talk to each other through a structured protocol. If A wants
  something from B, A sends `@b ...` and reads the reply. That's it.
- **No supervisor dashboard, org chart, heartbeat scheduler, or
  auto-trigger.** Agents are inert until someone (a human, another
  agent, an external script) addresses them.
- **No personas as multi-thousand-character prompt blobs.** A short
  `description` field anchors the agent's purpose. The real "expertise"
  lives in the agent's accumulated notes — which the agent itself can
  curate, the human can edit, and git can track.
- **No second adapter for v0.** Claude Code only. OpenClaw already
  works via its existing gateway. We're not building a generic
  HTTP-webhook adapter until there's a user with that need.
- **No `--session-id` binding to Claude Code session UUIDs.** See
  "Cold-start runtime" below for why.
- **No new RPC verb.** `mycelium room send "@handle ..."` is the
  invocation primitive. Already exists.
- **No new database table for agents.** Agents are memory entries in
  a room. The existing memory primitive does everything we need.

---

## Core idea: an agent is a memory entry + an adapter route

Everything about an agent lives in the room's memory, under the
`agents/<handle>/...` namespace:

```
<room>/
  agents/release-agent              ← agent manifest (config)
  agents/release-agent/notes        ← persistent brain (markdown)
  agents/release-agent/log/<ts>     ← invocation transcripts
```

Manifest contents (frontmatter on the `agents/<handle>` memory entry):

```markdown
---
key: agents/release-agent
created_by: julia
version: 1
---
adapter: claude_code
cwd: ~/Documents/GitHub/mycelium
description: |
  Cuts releases for mycelium-cli. Bounded to the release flow —
  pull, version bump, tag, push, watch CI, gh release create.
budget_usd_per_month: 5
allow_from: ["@julia", "@docs-agent"]
```

That's the entire registry. No tables. No daemon-internal state. Just
markdown files in the existing memory primitive, version-controlled like
any other room content.

---

## How invocation works (no new verb)

The existing addressed-message primitive carries everything:

```bash
mycelium room send dev "@release-agent pull latest, new release"
```

The Mycelium backend writes the message. SSE pushes it to subscribers.
The Claude Code daemon (next section) picks it up, dispatches, posts
the reply back to the room as `@release-agent`.

Quality-of-life shortcut (not a new primitive — just typing comfort):

```bash
mycelium agent invoke release-agent "pull latest, new release"
# desugars to: mycelium room send <agent's home room> "@release-agent ..."
```

---

## The one genuinely new piece: `mycelium-cc-daemon`

A userlevel daemon that's the Claude Code mirror of the OpenClaw
gateway. It subscribes to room SSE, watches for `@handle` mentions,
and dispatches them to `claude -p` spawns.

Architectural symmetry:

```
        Mycelium room (SSE)
                │
        ┌───────┴────────┐
        │                │
 OpenClaw gateway   mycelium-cc-daemon
 (existing)         (new, ~150 lines)
        │                │
   openclaw            claude -p
   agents              spawns (cold)
```

Both gateways subscribe to the same rooms. Each only dispatches handles
where the agent's `agents/<handle>` manifest says it owns the adapter.
The room is the bus; gateways are dispatchers; manifests are the
routing table.

### Daemon dispatch loop (pseudocode)

```python
async for msg in sse_subscribe(room):
    handle = parse_addressed_mention(msg)        # "@release-agent"
    if not handle:
        continue
    agent = await memory_get(room, f"agents/{handle}")
    if not agent or agent.adapter != "claude_code":
        continue                                  # not our agent

    # Budget + allow_from checks
    if not budget_ok(agent) or msg.sender not in agent.allow_from:
        continue

    notes = await memory_get(room, f"agents/{handle}/notes") or ""

    result = subprocess_run([
        "claude", "-p", msg.body,
        "--cwd", agent.cwd,
        "--append-system-prompt", notes,
        "--output-format", "json",
    ])

    # Log the invocation as a memory entry (existing primitive)
    ts = utcnow_iso()
    await memory_set(room, f"agents/{handle}/log/{ts}", result.transcript)

    # Reply in the room as the agent (existing send primitive)
    await room_send(room, result.final_message, as_handle=handle)
```

Per-agent serial queue to prevent concurrent spawns clobbering the
agent's `cwd`. Depth-limit (cap at ~5 chained handoffs) and origin-chain
tracking on messages to prevent A→B→A loops.

---

## Cold-start runtime — Mycelium owns the agent's brain

`claude -p` is non-interactive and starts cold every invocation. We do
NOT try to bind to existing Claude Code session UUIDs. Reasons:

1. `claude -r/--resume` opens an interactive REPL even with `-p`
   (verified empirically).
2. Even if we could rehydrate a session, Claude Code owns the storage
   format and retention. Anthropic can change the JSONL schema, drop
   sessions, or compact lossily — none of which we want for a memory
   we curate.
3. We can't `vim` a Claude Code session to fix a wrong fact.

Instead: **every `claude -p` invocation is fresh**, with the agent's
`agents/<handle>/notes` memory pre-pended as the system prompt. The
notes are the brain. They're plain markdown, owned by Mycelium, and
curatable by humans and agents alike.

```bash
claude -p "$PROMPT" \
  --cwd "$CWD" \
  --append-system-prompt "$NOTES" \
  --output-format json
```

If conversation history matters (it doesn't for runners like
release-agent, but might for conversational specialists), the daemon
can concatenate the most recent N log entries into the system prompt.
Configurable per-agent.

### How agents update their own notes

The agent has `mycelium` CLI access inside its `cwd`. When it learns
something durable:

```bash
mycelium memory set agents/release-agent/notes "$(cat <<'EOF'
... updated notes including the new lesson ...
EOF
)"
```

We ship a small skill into the agent's `cwd` (via the same adapter
install) that tells the agent how to do this and when.

---

## Installation: daemon is an adapter step

The daemon lives inside `mycelium-cli/src/mycelium/adapters/claude_code/`
alongside the existing skill + hooks. It's installed as another
`--step`, identical pattern to OpenClaw's `--step=otel` / `--step=docker-env`.

### Adapter directory layout

```
mycelium-cli/src/mycelium/adapters/
├── openclaw/                       (existing)
│   └── mycelium/plugin/            installed into OpenClaw gateway
└── claude_code/                    (existing dir; expand)
    ├── skill/                      existing — /mycelium slash command
    ├── hooks/                      existing — session-start, knowledge-extract, ...
    └── daemon/                     NEW
        ├── __main__.py             entry point
        ├── dispatch.py             SSE → @handle parse → claude -p spawn
        ├── service/
        │   ├── launchd.plist.j2    macOS template
        │   └── systemd.service.j2  Linux template
        └── README.md
```

### CLI

```bash
# Default install — skill + hooks (existing behavior, unchanged)
mycelium adapter add claude-code

# Add the daemon (registers with launchd/systemd, starts it)
mycelium adapter add claude-code --step=daemon

# Skill only / hooks only — already exist
mycelium adapter add claude-code --step=skill

# All steps including daemon
mycelium adapter add claude-code --step=all

# Reversible
mycelium adapter remove claude-code --step=daemon
```

What `--step=daemon` does:

1. Drops a `mycelium-cc-daemon` runner script into `~/.local/bin/`.
2. Renders the right service template — `launchd` on macOS,
   `systemd --user` on Linux.
3. Installs the unit file
   (`~/Library/LaunchAgents/io.mycelium.cc-daemon.plist` or
   `~/.config/systemd/user/mycelium-cc-daemon.service`).
4. `launchctl bootstrap` / `systemctl --user enable --now`.
5. Polls the health endpoint until the daemon is alive; reports back.

---

## Daemon lifecycle commands

Small new command group. Mirrors `mycelium gateway ...` on the
OpenClaw side.

```bash
mycelium daemon status      # reads the health endpoint
mycelium daemon logs --follow
mycelium daemon restart
mycelium daemon run --foreground   # debug mode, no service manager
```

---

## Doctor integration

`mycelium doctor` already audits adapter installs (e.g. it flags
missing hooks under `~/.claude/hooks/`). Adding daemon checks is just
more entries in the same audit:

```
$ mycelium doctor

  ✓ claude-code adapter
    ✓ skill         /mycelium installed at ~/.claude/skills/mycelium
    ✓ hooks         3 hooks installed at ~/.claude/hooks
    ✓ daemon
      ✓ binary      ~/.local/bin/mycelium-cc-daemon
      ✓ service     io.mycelium.cc-daemon registered with launchd
      ✓ running     pid 48211, uptime 3d 14h
      ✓ SSE         connected to localhost:8000, last heartbeat 4s ago
      ✓ rooms       subscribed to: dev, hackathon, polaris-experiments
      ✓ agents      4 registered (release-agent, docs-agent, lint-agent, deploy-agent)
      ✓ last run    release-agent 14s ago — OK
```

With `--fix`, doctor can auto-recover: restart a dead daemon, reload
the service, re-subscribe to dropped rooms.

### Health surface

The daemon exposes a unix-socket HTTP endpoint at
`~/.mycelium/cc-daemon.sock`:

```json
GET /health
{
  "status": "ok",
  "uptime_s": 49823,
  "rooms_subscribed": ["dev", "hackathon", "polaris-experiments"],
  "agents_registered": 4,
  "last_dispatch": {
    "agent": "release-agent",
    "ts": "2026-05-13T14:22:08Z",
    "duration_s": 38.4,
    "result": "ok"
  },
  "errors_last_hour": 0
}
```

`doctor` and `daemon status` both consume this endpoint.

---

## CLI sugar for working with agents

These are thin wrappers over the existing `memory` primitive. Pydantic
validates the manifest payload; storage is just `memory set` under the
`agents/...` namespace.

```bash
# Register
mycelium agent add release-agent \
  --adapter claude_code \
  --cwd ~/Documents/GitHub/mycelium \
  --room dev \
  --description "Cuts releases for mycelium-cli"
# == mycelium memory set agents/release-agent "<validated yaml>"  in room dev

# List
mycelium agent ls
# == mycelium memory ls agents/

# Inspect
mycelium agent show release-agent
# == mycelium memory get agents/release-agent
#    + mycelium memory get agents/release-agent/notes
#    + most recent log entry

# Invoke (typing shortcut, not a new verb)
mycelium agent invoke release-agent "pull latest, new release"
# == mycelium room send <agent.room> "@release-agent pull latest, new release"
```

---

## Worked example

```bash
# One-time setup
mycelium adapter add claude-code --step=daemon
mycelium agent add release-agent \
  --adapter claude_code --cwd ~/repos/mycelium --room dev

# Seed the brain (optional — agent will fill in as it learns)
mycelium memory set agents/release-agent/notes "$(cat <<'EOF'
You cut releases for mycelium-cli. The flow:
1. git pull origin main
2. Bump version in pyproject.toml (patch unless told otherwise)
3. git tag v$VERSION && git push origin v$VERSION
4. Watch CI, then gh release create

When you learn something durable, update yourself:
  mycelium memory set agents/release-agent/notes "$NEW_NOTES"
EOF
)"

# Later — from any session, terminal, or another agent
mycelium room send dev "@release-agent pull latest, new release"

# Daemon picks up the message, reads the manifest + notes, spawns
# claude -p in ~/repos/mycelium with the notes as system prompt,
# captures result, writes transcript to agents/release-agent/log/<ts>,
# and posts the reply to #dev as @release-agent.
```

---

## v0 acceptance criteria

1. `mycelium agent add` writes a validated manifest into the active
   room's memory under `agents/<handle>`.
2. `mycelium agent invoke <handle> "..."` posts an addressed message
   to the agent's home room (using existing `room send`).
3. `mycelium adapter add claude-code --step=daemon` installs the daemon
   as a user-level service, registers it with launchd or systemd, and
   starts it. The opposite verb removes it.
4. The daemon, when running:
   - Subscribes to SSE for rooms in which `agents/*` manifests with
     `adapter: claude_code` exist.
   - On `@handle` mention in a subscribed room: looks up the manifest,
     spawns `claude -p` in the agent's `cwd` with `agents/<handle>/notes`
     as the system prompt, captures the result.
   - Writes a log entry to `agents/<handle>/log/<ts>`.
   - Posts the reply back to the room under the agent's handle.
   - Serializes per-handle (no two concurrent spawns for the same agent).
   - Enforces `allow_from` and `budget_usd_per_month` from the manifest.
   - Caps message-chain depth to prevent loops.
5. `mycelium doctor` reports daemon health alongside existing
   adapter-install checks, including last-error visibility.
6. The agent's own Claude Code session can update its notes via the
   `mycelium memory set agents/<handle>/notes ...` CLI — the skill we
   ship into the `cwd` tells the agent how + when.

---

## Stretch (only if v0 lands cleanly)

- **Async invoke** — return a handle, poll for completion. Needed when
  the agent's job takes minutes.
- **Conversational context window** — daemon concatenates the last N
  log entries into the system prompt for conversational specialists.
  Configurable per-agent via `context_window: 3` on the manifest.
- **Second adapter** — generic HTTP webhook, for users who run agents
  elsewhere. Defer until a real user asks.
- **Per-handle ACL beyond `allow_from`** — read/write scope on which
  memory keys the agent can touch.

---

## File-level outline for the implementer

### New

```
mycelium-cli/src/mycelium/adapters/claude_code/daemon/
  __init__.py
  __main__.py                    # `python -m mycelium.adapters.claude_code.daemon`
  dispatch.py                    # the loop above
  service/
    launchd.plist.j2
    systemd.service.j2

mycelium-cli/src/mycelium/commands/
  agent.py                       # add / ls / show / invoke (CLI sugar)
  daemon.py                      # status / logs / restart / run

mycelium-cli/src/mycelium/sstp.py  (existing file, just extend)
  + AgentManifest pydantic model for the frontmatter validation
```

### Modify

```
mycelium-cli/src/mycelium/commands/adapter.py
  + handle --step=daemon for claude-code: render template, install
    service, start, health-check

mycelium-cli/src/mycelium/commands/doctor.py
  + daemon health checks (binary present, service registered, running,
    SSE connected, last-error fresh)
```

### Skill drop

```
mycelium-cli/src/mycelium/adapters/claude_code/skill/SKILL.md
  + a paragraph telling Claude Code agents how + when to update their
    own agents/<handle>/notes memory entry
```

---

## Open questions for the implementer

1. **Where does the daemon get its list of rooms to subscribe to?**
   - Option A: scan all rooms for `agents/*` entries with
     `adapter: claude_code` on startup, plus subscribe to room-list
     events to pick up new ones.
   - Option B: explicit `mycelium daemon subscribe <room>` command.
   - I'd lean A (zero config), but it's a real call. Could be A with B
     as override.

2. **How does the daemon authenticate to the Mycelium backend?**
   - Probably reads the same `~/.mycelium/config.toml` the CLI does.
   - All Claude Code agents run as the user, so single-tenant auth is
     fine.

3. **What's the exact behavior when the same agent is in multiple
   rooms?** The manifest lives in one home room, but is the agent
   addressable from others? v0 answer: home room only. If the user
   wants the agent in two rooms, they create two manifests.

4. **`mycelium agent invoke` when the daemon is dead — fallback to
   direct spawn?** v0 yes. The CLI knows the manifest; it can spawn
   `claude -p` itself when the daemon isn't reachable. Daemon is only
   required for *room-driven* (`@mention`) invocation, not CLI-driven.

5. **Loop / depth cap exact policy.** I suggested 5. Pick a number,
   make it configurable per-agent.

---

## Related artifacts

- `docs/sketches/supervisor.html` — the older sketch where some of these
  ideas were over-built. Reference for what NOT to do (supervisor
  dashboard, conflict detection banner, org chart, structured negotiation).
- `videos/preview/supervisor.mp4` — same. Will need to be revisited or
  pulled once v0 lands and the messaging shifts.
- `compositions/preview/supervisor/index.html` — source for that
  promo. Same caveat.
