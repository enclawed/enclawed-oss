# Egress Action Batcher

The action batcher is a stage of the covert-channel egress suite. It shrinks
**choice-type covert channels**. In these channels the information is not in
what an action carries but in which allowed actions an agent takes, in what
order, and how many times. Every action can pass every content check and the
pattern of actions still carries a message.

The plugin builds the batcher from its config and registers it with
`@enclawed/egress-core`. The `egress-mediator` plugin applies it at the
tool-call chokepoint (`before_tool_call`) and feeds it results
(`after_tool_call`). Applications that own their own chokepoints can use
`createActionBatcher` from `@enclawed/egress-core` directly.

## The three channels

Suppose an agent issues k actions per window, each chosen from N allowed
actions:

| Channel  | What carries the bits         | Capacity per window | k = N = 16 |
| -------- | ----------------------------- | ------------------- | ---------- |
| sequence | the order of the k choices    | k·log2(N)           | 64 bits    |
| multiset | how often each action is used | log2(C(N+k-1, k))   | 28.2 bits  |
| subset   | which actions are used at all | N (with k ≥ N)      | 16 bits    |

Each defense removes one layer:

- **Canonical order** removes the sequence channel, which leaves the multiset.
- **Idempotent-repeat collapse** removes the count channel, which leaves the subset.
- **Padding** makes the observed set constant, which leaves 0.

## Options

The batcher's mode (`enforce`, `audit` or `off`) is the mediator's
`stages["egress-action-batcher"]` entry. It defaults to `enforce`, because
the batcher only reorders actions and withholds idempotent repeats. It never
rewrites an action. In `audit` mode every action is released at once and
collapsible repeats are reported as findings.

| Option                      | Default   | Capacity effect                                                                                                                                                                         | Cost                                                                                                                                                                    |
| --------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`                   | `true`    | Registers the batcher with the mediator.                                                                                                                                                | None.                                                                                                                                                                   |
| `windowMs`                  | `250`     | Only actions in the same window are reordered or collapsed, so a longer window covers more of a burst. 250 to 10000.                                                                    | Adds up to `windowMs` of latency to each batched tool call.                                                                                                             |
| `canonicalOrder`            | `true`    | Releases the window's independent actions sorted by SHA-256 of their canonical encoding. The sequence channel falls to the multiset bound. `false` is refused.                          | The buffering latency. Dependent actions keep their order.                                                                                                              |
| `collapseIdempotentRepeats` | `true`    | Collapses repeats of idempotent actions (see the table below). The multiset bound falls to the subset bound. `false` is refused.                                                        | A collapsed repeat is not re-sent. The agent gets the result of the earlier identical call.                                                                             |
| `cacheTtlMs`                | `30000`   | Cross-window repeat answering for the whole run. An integer from 1 to 600000; 0 is refused.                                                                                             | Within one run, a repeated read may be answered from a recent copy. Only an unsafe-method request to its origin, or a side-effecting call naming its origin, clears it. |
| `padding.enabled`           | `false`   | Each active window issues every member of `padding.allowedSet` that the agent did not choose, on a fixed window grid. The per-window choice capacity falls to 0 for actions in the set. | One request for every member of `allowedSet` in each active window, plus latency from aligning to the grid. Repeats are only hidden if collapse is also on.             |
| `padding.allowedSet`        | `[]`      | The set that padding keeps constant. Each entry is a URL (GET) or `{ method, url }` with method GET, HEAD or OPTIONS.                                                                   | Any other entry is refused, and an empty set with `padding.enabled` is refused.                                                                                         |
| `tools`                     | see below | The tool calls that are batched. The defaults can only be added to.                                                                                                                     | Latency on those tools only.                                                                                                                                            |

The default `tools` are `message`, `sessions_send`, `web_fetch`,
`web_search`, `x_search`, `browser` and `write`. Shell tools (`exec`, `bash`)
are batched when their command reaches the network. Local reads are not
batched, because no outside party observes them.

Padding requests run the request path of the tool they pad: the open core's
`web_fetch` publishes its own path (same headers, SSRF guard, byte limit and
cancel, error-body limit and provider fallback), so a dummy leaves, and is
read, exactly like a real fetch. Real and dummy requests leave in one
lockstep canonical sequence: every released real GET waits at its issue
slot until all of the window's real GETs have arrived, then the slots open in
canonical order, one per event-loop turn. A released GET that never reaches
its slot (for example when `web_fetch`'s own cache answers) is sent as
padding at its slot; if the tool arrives after its slot expired, its request
is held for its key's slot in the scope's next window, which it opens itself
if none is open, so it never hangs and never leaves twice in one window. No
dummy leaves before every released real GET of its window has reached its
slot, so real and dummy slots are paced alike. Whether a window is active at
all is left to `egress-cover-traffic`.

Padding fails closed when no request client exists: the window's real
actions are blocked with a high-severity `padding-undeliverable` finding. A
dummy that fails in flight fails exactly as a real request of the same URL
would, so it is reported and blocks nothing (a receiver cannot latch padding
closed by failing or hanging dummies).

A request outside `allowedSet` leaks its identity. Its charge is at most 9
bits per byte of its wire form plus 1 (a prefix-free code), taken from the
capacity ledger before the window is released. When the ledger cannot pay,
the window holds up to 10 s and then refuses that request
(`padding-outside-set-over-budget`). Without a ledger it is refused.

## Idempotency classification

Collapsing a repeat is sound only when doing an action twice has the same
effect as doing it once. The classification is a fixed table. Anything the
table does not know is never collapsed, so it fails toward overt.

| Action                                       | Class       | Collapsed                             |
| -------------------------------------------- | ----------- | ------------------------------------- |
| HTTP GET, HEAD, OPTIONS                      | cacheable   | within the window and from cache      |
| HTTP PUT, DELETE                             | window-only | within the window only (side effects) |
| HTTP request its owner declares a read       | cacheable   | within the window and from cache      |
| HTTP POST and any other method               | never       | no                                    |
| File write with identical target and content | window-only | within the window only                |
| Message or send                              | never       | no                                    |
| Tool call with no declared observation       | refused     | never batched (enforce mode)          |

A window-only action collapses only when no other side-effecting action on
the same resource shares its window. Resources are compared conservatively:
every side-effecting HTTP request shares one resource (different paths and
even different origins may alias one backend state), so two different
side-effecting requests in a window conflict and neither collapses; a file
is its filesystem identity (`dev:ino:birthtimeNs`) when it exists, so a hard
link is the same file, else its resolved path. Safe GETs and declared reads
never conflict.

Memory never refuses a legitimate repeat. A recorded outcome that must leave
memory (64 MiB per run, 256 MiB per process) moves to a private spill file
and still answers its repeats. When it cannot be spilled, its key stays in
the refresh rotation and a repeat is answered at that key's next scheduled
refresh, so nothing leaves at a time the agent chooses. A repeat is refused,
with nothing sent, only when its record has no refresh function, after the
run's 24 h refresh lifetime, beyond 65,536 distinct requests in one run, or
beyond 1,024 concurrent runs.

Actions are keyed by what leaves the host, never by a tool call's
parameters: a parameter that never reaches the observer would let a sender
vary it to choose the sort order of its calls and to split identical
repeats. A tool call is batched only through a declared mapping from the call
to the action it performs (its observation):

- `web_fetch` (declared by the mediator): an HTTP GET of its URL.
  `extractMode` and `maxChars` only shape the text returned to the model, so
  they are dropped.
- `write` (declared by the open core, `src/agents/tool-observation.ts`): a
  file write of the content to the file the tool writes, its path resolved as
  the tool resolves it and, on the host, through existing symbolic links.
- Any tool whose owner sets `Symbol.for("enclawed.tool-observation")` on the
  tool object: a function from the call's parameters to its observation.

Declarations in the open core: `web_search` (the selected provider's own
request: Brave, DuckDuckGo, SearXNG, Tavily, Exa, Firecrawl, Gemini,
Perplexity, Ollama and Grok each declare it from the code that builds it,
with every fallback provider's request in the key), `x_search` (a declared
read POST), `sessions_send` (the resolved session-store key and the exact
gateway request) and `message` for channels that declare their sends
(`observeSend`/`observeAction` on the channel adapter; IRC today). A call
whose owner declares that it sends nothing (an answer without a request, a
dry run) is not batched. A value the host derives from its clock (a
freshness window's start date) is keyed by the parameter that determines it,
so a repeat cannot be re-sent by waiting.

Three cases are not refused for lacking a mapping:

- `message` on a channel that declares nothing: released after the window's
  sorted block, in arrival order, as an ordering barrier whose order is
  charged to the capacity ledger (`unordered-send` audit record).
- `browser`, and network commands of `exec` and `bash`, whose requests are
  chosen at run time: released unbatched (`unbatched-runtime-request` audit
  record); every other egress check still applies, and the origins they name
  lose their recorded outcomes.
- By tool identity only. Any other tool in `tools` with no declared mapping
  is refused while the stage enforces (`unmapped-tool`); in audit mode it is
  released unbatched and recorded. The batcher itself refuses any `tool`
  action (a call described only by its parameters) in enforce mode.

Two actions are identical when their canonical encodings match. For HTTP the
encoding is the upper-cased method, the WHATWG-normalized URL with the
fragment and an empty query removed, and the body.

## Dependencies

Data-flow dependents are ordinary concurrent actions. The mediator records
which earlier result a call's input came from (`dataFlowFrom`): the
distinctive tokens of each completed tool result in the same run, which are
strings of 12 or more characters such as URLs, ids and paths. This is audit
information only. Nothing in an open window has been released, let alone
completed, so a data-flow dependency always points to an earlier window.
Sorting, collapsing and caching a dependent is therefore exactly as safe as
for any other action, and that is what the batcher does. Making dependents
barriers would let injected content that names URLs turn every fetch of them
into an uncollapsed, unsorted action.

An explicit ordering dependency, declared by a standalone caller through
`dependsOn`, is a barrier. Barriers are released after all of the window's
other actions, in arrival order. Their placement therefore carries nothing
beyond their own order: log2(d!) bits for d barriers. That is charged to the
sink's capacity ledger (`action:<scope>`) before anything is released, and in
`enforce` mode a barrier the ledger cannot pay for is blocked.

## Measured effect

`pnpm bench:covert` runs the choice-channel family through this batcher with
working encoders and decoders: k = 16 GET requests from N = 16 allowed URLs,
2000 trials per cell. Decoded bits are the sum of the per-bit mutual
information between the sent and decoded message, with Miller-Madow
correction.

| Encoding      | Capacity | Undefended | Canonical order | Order + collapse | Order + collapse + padding |
| ------------- | -------- | ---------- | --------------- | ---------------- | -------------------------- |
| sequence      | 64.00    | 63.95      | 0.24            | 0.07             | 0.00                       |
| multiset      | 28.16    | 27.98      | 27.98           | 0.00             | 0.00                       |
| subset        | 16.00    | 15.99      | 15.99           | 15.99            | 0.00                       |
| best encoding |          | 63.95      | 27.98           | 15.99            | 0.00                       |

The multiset encoder uses floor(log2 C(31,15)) = 28 of the 28.16 available
bits. The small gaps below the integer bounds come from the Miller-Madow
correction. `test/egress-suite/covert-benchmark.test.ts` fails if any cell
drifts.

## Limits

- The batcher can only reorder actions that are in flight together. An agent
  that issues one tool call at a time and waits for each result gives it a
  window of one action. For those agents, only repeat collapse applies.
- Release order is the order of dispatch. The network may reorder requests in
  flight, but the agent does not control that.
- Padding covers only actions in `allowedSet`. An action outside the set stays
  distinguishable; its identity (9 bits per wire byte plus 1) is charged to
  the ledger and enforced (see above).
- Within one run, a repeated read may be answered from a recent copy.

## Validation

The plugin config is validated fail-closed: an unknown key, a wrong type, an
out-of-range value, or a value that would weaken the batcher (turning
canonical order or collapse off, `cacheTtlMs: 0`, removing a default tool, an
invalid padding entry) refuses the plugin config instead of being clamped or
ignored.
