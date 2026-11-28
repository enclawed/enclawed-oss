---
title: Covert-Channel Egress Defense
summary: What the covert and steganographic egress suite removes, where it runs, how to turn it on, and what it cannot remove.
read_when:
  - Deciding whether to enable the egress-* plugins
  - Tuning a stage or escalating it from audit to enforce
  - Explaining what the suite does and does not protect against
permalink: /security/covert-channel-egress/
---

# Covert-Channel Egress Defense

Allowlists decide _where_ an agent may send data. They cannot see _what is
hidden inside_ a message that is allowed to go. The covert-channel egress
suite closes that gap: it inspects and rewrites the text an agent sends out,
and the text that comes back in, so that data smuggled inside an otherwise
normal payload is removed, measured, or blocked.

The suite is a set of bundled plugins (`egress-mediator` plus one plugin per
technique) built on the `@enclawed/egress-core` library. It is part of the
open edition. It complements the host-allowlist egress guard described in
[Security](/gateway/security).

## What a covert channel is

A covert channel is any way of passing information through something that was
not meant to carry it. Steganography is the special case where the hidden data
rides inside ordinary-looking content.

A compromised agent, tool, skill, or plugin that wants to leak a secret does not
need a forbidden destination. It can send a perfectly normal message to an
allowed one and encode the secret in details nobody reads:

| Carrier                  | Plain-words example                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| Invisible characters     | Zero-width spaces between letters; each one present or absent is a bit                    |
| Unicode Tag characters   | An invisible copy of a whole sentence appended after "Thanks!" ("ASCII smuggling")        |
| Homoglyphs               | A Cyrillic "а" in place of a Latin "a" inside an English word                             |
| Whitespace and spacing   | One space or two after a period; a trailing space at the end of a line                    |
| Punctuation and glyphs   | "!" or "!!"; a straight quote or a curly quote; a hyphen or an en dash                    |
| Word choice              | "large" or "huge"; "it is" or "it's"; active or passive voice                             |
| Encoded blobs            | A long base64 or hex string presented as an "ID"                                          |
| Element order            | The order of keys in a JSON object                                                        |
| Repetition               | Sending "Status: OK" and later "Status: OK." where the dot is the signal                  |
| Timing, rate and volume  | Waiting a short or long time between messages; sending many or few                        |
| Images                   | The least significant bit of each pixel; the overall brightness of each image in a series |
| Audio                    | An ultrasonic tone above 20 kHz; a tone 60 dB quieter than the speech it rides under      |
| Choice of allowed action | Which of several allowed URLs is fetched, in which order, how many times                  |

Content carriers (the first nine rows) hide data in _what_ is sent. Side
channels (timing, rate, volume) hide it in _how_ it is sent.

No defense can prove zero leakage. The goal of the suite is **channel-capacity
reduction**: drive the number of bits an attacker can push through toward zero,
and record a measured estimate of what is left. Stages are layered so that an
encoding missed by one is degraded by another.

## How the suite works

A single reference monitor, the `egress-mediator` plugin, owns the chokepoints.
Every other text plugin registers a **stage** with it. At each chokepoint the
mediator runs the registered stages in a fixed order over the payload. Each
stage can let the payload pass, rewrite it, delay it, or cancel it.

```
payload -> egress-mediator
  10 canonicalizer -> 20 taint tracker -> 30 entropy scanner -> 35 replay sentinel
  -> 40 noise injector -> 45 semantic scrambler -> 46 LLM scrambler
  -> 48 timing scrambler -> 50 behavioral invariants
  -> pass | rewrite | delay | cancel
```

Rewrites chain (each stage sees the previous stage's output), delays add up,
and the first cancel stops the pipeline. A stage that throws an error while
enforcing cancels the payload (fail closed); a stage that throws while auditing
is skipped. With no stages registered, the mediator passes everything through
unchanged.

### The chokepoints

The suite works in both directions. Outbound, it stops data leaving inside a
message, an attachment, or a tool call. Inbound, it cleans what enters the model context, so
hidden text in a web page, a file, or a chat message (for example an invisible
Unicode Tag instruction, or a credential) is stripped or withheld before the
model reads it.

| Chokepoint      | Direction | What is mediated                                                     | Open posture | Hardened posture |
| --------------- | --------- | -------------------------------------------------------------------- | ------------ | ---------------- |
| Channel send    | Outbound  | Every outbound channel message (`message_sending` hook)              | On           | On               |
| Tool-call args  | Outbound  | Arguments of tools that send data off the host (`before_tool_call`)  | Off          | On               |
| Tool results    | Inbound   | Text blocks of every tool result, before the model sees them         | Off          | On               |
| Inbound message | Inbound   | Inbound channel messages, before they are dispatched to the model    | Off          | On               |
| Media send      | Outbound  | Attachments of every outbound channel message (`media_sending` hook) | On           | On               |

The hardened posture is `ENCLAWED_FLAVOR=enclaved` (or its aliases `secure`,
`classified`, `high-side`); see
[Editions and Hardening](/reference/editions-and-hardening). In the open
posture explicit plugin config wins over the posture default. In the hardened
posture a chokepoint can only be on: setting one of these switches to `false`
refuses gateway start (see [Hardened posture](#hardened-posture-defaults)).

### Where the send hooks fire

`message_sending` (text) and then `media_sending` (attachments) run on every
path that sends agent output to a channel, through one shared helper:

| Path                                 | Covers                                                                                                                                                                                                                                             |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core outbound delivery               | `deliverOutboundPayloads`: cron and heartbeat deliveries, cross-channel reply routing, the core `send` path                                                                                                                                        |
| Reply dispatcher                     | Every final, block and tool reply a channel delivers for an inbound message, for every bundled and third-party channel, before the channel's own deliver code runs                                                                                 |
| Message actions                      | `send`, `reply`, `thread-reply`, `edit`, `sendWithEffect`, `sendAttachment`, `upload-file` from the `message` tool, the CLI, or the gateway, including channels that handle the action themselves; inline base64 attachments are mediated as bytes |
| Channel paths outside the dispatcher | Telegram plugin-command and fallback replies, the WhatsApp heartbeat reply, Voice Call speech (`speak`, before text-to-speech)                                                                                                                     |

A message is mediated once: a channel's deliver code (or a nested
`deliverOutboundPayloads` call inside it) runs inside the mediated scope and
does not run the hooks again.

While a `message_sending` or `media_sending` handler is registered, streaming
previews are withheld: draft edits, reasoning lanes, and progress drafts
(`onPartialReply`, `onReasoningStream`, `onItemEvent`, `onPlanUpdate`,
`onCommandOutput`, `onPatchSummary`). Those show text before the hooks could
see it, so a rewrite or a cancel would be defeated. Final, block, and tool
replies still arrive.

Out of scope for the send hooks, by design:

- **Fixed text.** Pairing codes, error fallbacks, menus, and status reactions
  carry no agent output.
- **Message actions that carry no message** (renames, topics, profiles, polls,
  reactions). The tool-call chokepoint mediates their arguments.
- **Channel tools that drive an external client** (`tlon`). They are in the
  default `toolCall.tools` list, so their arguments are mediated at the
  tool-call chokepoint.
- **Names a model generates for the channel itself**, such as an automatic
  Telegram topic label or Discord thread title.
- **Realtime voice.** In realtime mode the voice model speaks directly. Only
  `speak` is mediated.
- **Raw channel sends from an operator CLI** that bypass the gateway, for
  example a `--dry-run` path or a channel's own debugging command. These are
  operator actions, not agent output.

The CLI's channel outbound runtime is not one of these: it is only reached
through `deliverOutboundPayloads`, so it is already covered.

What each chokepoint does on a block:

- **Channel send:** the message is not delivered.
- **Tool-call args:** the tool call is blocked with an `egress-mediator: <reason>`
  error the agent can see.
- **Tool results:** the result text is replaced with
  `[egress-mediator: content withheld (<reason>)]`.
- **Inbound message:** the message is claimed without a reply and never reaches
  the model.
- **Media send:** the message (text and attachments) is not delivered.

Tool-call mediation covers the tools listed in `toolCall.tools` (default
`message`, `sessions_send`, `web_fetch`, `web_search`, `x_search`, `browser`,
`tlon`).
For the shell tools in `toolCall.commandTools` (default `exec`, `bash`), only a
command that invokes a network client (for example `curl`, `wget`, `ssh`,
`scp`, `git push`, `npm publish`, `/dev/tcp/`, or a literal `http://` URL) is
mediated; local commands are left alone. A tool call is mediated as one
payload: its string arguments are joined with per-call random boundary
markers, the pipeline runs once, and a rewrite is split back into the same
arguments. Rewriting stages transform each argument separately, so a rewrite
never breaks the argument structure and object keys are never changed; the
timing delay applies once per call, and the call counts once toward the rate
and volume limits and the replay history. A rewrite that loses a boundary
marker cannot be reassembled, and the call is blocked.

The four text chokepoints run the text stages below. The media chokepoint runs
the media scramblers instead; see
[Media exemptions, ordering, and where media is mediated](#media-exemptions-ordering-and-where-media-is-mediated).

Delays (timing shaping) apply only to observable egress: channel sends and tool
calls. Tool results and inbound messages are never delayed.

## Modes: audit, enforce, off

Every stage runs in one of three modes:

- **`enforce`**: rewrites, delays and cancels take effect.
- **`audit`**: the stage runs and records what it found and what it _would_
  have done, but the payload goes through unchanged.
- **`off`**: the stage is skipped.

The defaults follow a staged rollout. Stages that only remove carriers with no
legitimate use enforce from day one; stages that change visible text, add
latency, or need a baseline start in audit so you can see their effect first.

| Stage                          | Default mode |
| ------------------------------ | ------------ |
| `egress-canonicalizer`         | enforce      |
| `egress-taint-tracker`         | enforce      |
| `egress-entropy-scanner`       | audit        |
| `egress-replay-sentinel`       | audit        |
| `egress-noise-injector`        | audit        |
| `egress-semantic-scrambler`    | audit        |
| `egress-llm-scrambler`         | audit        |
| `egress-timing-scrambler`      | audit        |
| `egress-behavioral-invariants` | audit        |
| `egress-action-batcher`        | enforce      |
| `egress-image-scrambler`       | audit        |
| `egress-audio-scrambler`       | audit        |
| `egress-media-order`           | audit        |

In the open posture, change a mode per stage with the mediator's `stages` map,
or set `posture: "enforce"` to enforce every stage at once (per-stage entries
still win). Audit mode lets the payload through unchanged, so in the hardened
posture every stage enforces and `audit` or `off` is refused (see
[Hardened posture](#hardened-posture-defaults)). Findings go to an in-memory, size-capped audit buffer (2048 records), and
every block is logged as a warning.

## Capacity ledger

The mediator keeps a **capacity ledger** per destination: a token bucket of
covert bits. Detection stages estimate how many hidden bits a payload could
carry and charge that estimate to the destination's bucket.

| Mediator option           | Type   | Default | Effect                                 |
| ------------------------- | ------ | ------- | -------------------------------------- |
| `ledger.capacityBits`     | number | `4096`  | Bucket size: the largest burst allowed |
| `ledger.refillBitsPerSec` | number | `256`   | Steady refill rate                     |

- The **entropy scanner** in `enforce` mode consumes its estimate from the
  bucket and cancels the payload when the bucket is empty. In `audit` mode it
  only records the estimate.
- The **replay sentinel** records its estimate in every mode; it never consumes
  or blocks.

A destination is a conversation (or channel) for channel sends, a tool name for
tool calls (`tool:web_fetch`), and a tool name or conversation for model input.
At most 4096 ledgers are kept; when the store is full, new destinations share
one overflow bucket, so inventing fresh destination ids buys no extra budget.

Estimates are deliberate upper bounds. Over-counting is the safe direction for
a security control. A small bucket with a slow refill makes the ledger a tight
per-destination cap on encoded content. `refillBitsPerSec: 0` means no refill at
all: each destination gets a fixed budget of `capacityBits` for the life of the
gateway process. `capacityBits` must be positive.

## Stages

Each stage is its own plugin. Options are set under
`plugins.entries.<plugin-id>.config`. Every option a plugin's schema declares
is applied. A value of the wrong type, out of range, or an unknown key is an
`invalid config`. Every stage is a security stage (manifest `securityStage`),
so the gateway refuses to start; it never skips the stage, and it never runs a
stage that is silently weaker than configured. The same holds when a stage
fails to load or register. A config change under `plugins` restarts the
gateway, so an invalid edit is refused at that restart too.

### Canonicalizer

Plugin `egress-canonicalizer`, priority 10, default `enforce`. Runs at all four
chokepoints.

**What it removes.** Carriers that have no legitimate use in chat or agent text,
without changing what a reader sees:

- Unicode NFC normalization, so equivalent character sequences collapse to one.
- Invisible characters: zero-width space, word joiner and invisible math
  operators, byte order mark, Mongolian vowel separator, variation selectors
  1 to 14, the Unicode Tag block, and the variation-selector supplement.
  Zero-width joiner and non-joiner and the emoji presentation selectors are
  kept, because emoji and some scripts need them.
- Bidirectional controls (embeddings, overrides, isolates), which also defuses
  "Trojan Source" tricks.
- Mixed-script homoglyphs: inside a word that mixes Latin with Cyrillic or Greek,
  look-alike letters are folded to ASCII. A word that is entirely Cyrillic
  (real Russian) is left alone.
- Exotic Unicode spaces become ordinary spaces, and trailing spaces at line ends
  are removed. Ordinary spaces, tabs, newlines, and no-break space are kept.
- JSON key order: if the whole payload is a JSON object or array, it is
  re-emitted with sorted keys.

**Example.** `Hello` followed by forty invisible Tag characters spelling a
password becomes `Hello`. `pаypal` with a Cyrillic `а` becomes `paypal`.

**Options.** Each transform can be switched off on its own; all six default to
`true`. To skip the whole stage, set its mode to `off`.

| Option                | Type    | Default | Effect                                                    |
| --------------------- | ------- | ------- | --------------------------------------------------------- |
| `unicodeNfc`          | boolean | `true`  | Normalize Unicode to NFC                                  |
| `stripInvisible`      | boolean | `true`  | Remove invisible, zero-width and Tag characters           |
| `stripBidi`           | boolean | `true`  | Remove bidirectional controls                             |
| `foldMixedScript`     | boolean | `true`  | Fold look-alike letters in mixed-script words to ASCII    |
| `normalizeWhitespace` | boolean | `true`  | Turn exotic spaces into spaces and drop trailing spaces   |
| `canonicalizeJson`    | boolean | `true`  | Re-emit a whole JSON object or array (or argument) sorted |

**When to enable.** Always. It is lossless for normal text.

**Cost.** Negligible. A JSON payload is re-serialized compactly, so its
formatting (indentation) changes.

### Taint tracker

Plugin `egress-taint-tracker`, priority 20, default `enforce`. Runs at all four
chokepoints.

**What it removes.** Known sensitive values, however low their entropy:

- Credentials, which block in `enforce` mode: OpenAI-style `sk-` keys, GitHub
  tokens, Slack tokens, AWS access keys, Google API keys, PEM private-key
  headers, JWTs, `Bearer` tokens, and Luhn-valid card numbers.
- Generic PII (email addresses, IPv4 addresses), which is reported but never
  blocks, because normal messages contain it.
- Tagged values: a value an application has registered as sensitive for a
  conversation is matched by 8-character fingerprints, so it is caught even
  when lightly reformatted (85% fingerprint overlap is a match). The open core
  tags nothing by itself; this check only fires for values an application
  tags with `tagSensitiveValue` from `enclawed/framework` (see
  [Use the stages in your own application](#use-the-stages-in-your-own-application)).
  A value tagged without a scope is checked at every destination; a value
  tagged with a conversation id is checked only there. Values shorter than 8
  characters are ignored.

**Example.** A reply containing `AKIAABCDEFGHIJKLMNOP` is not delivered.

**Options.**

| Option    | Type    | Default | Effect                                                    |
| --------- | ------- | ------- | --------------------------------------------------------- |
| `enabled` | boolean | `true`  | `false` skips registering the stage when the plugin loads |

**When to enable.** Always. At the tool-result chokepoint it also keeps
credentials that a tool reads (for example from a config file) out of the model
context.

**Cost.** Low. In the hardened posture, a `curl` command that carries an
`Authorization: Bearer ...` header, or a tool result that contains a key, is
blocked or withheld; that is the intent, but plan for it.

### Entropy scanner

Plugin `egress-entropy-scanner`, priority 30, default `audit`. Runs at all four
chokepoints.

**What it detects.** Content that is denser than language:

- base64-like runs of 64 or more characters (charged at 6 bits per character);
- hex runs of 64 or more characters (4 bits per character);
- whole messages of 32 or more characters whose character entropy exceeds
  5.4 bits per character;
- messages of 64 or more characters that DEFLATE cannot shrink below 92% of
  their size.

The total is charged to the [capacity ledger](#capacity-ledger). It never
rewrites text.

**Example.** A 400-character base64 "reference code" is estimated at 2400 bits.
In `enforce` mode with the default ledger, a burst of such payloads to one
destination is cancelled once the bucket runs dry.

**Options.**

| Option                 | Type    | Default | Range         | Effect                                                        |
| ---------------------- | ------- | ------- | ------------- | ------------------------------------------------------------- |
| `minBlobLength`        | integer | `64`    | 8 to 65536    | Shortest base64 or hex run counted as an encoded blob         |
| `entropyThresholdBits` | number  | `5.4`   | above 0 to 16 | Character entropy (bits per character) above which to flag    |
| `incompressibleRatio`  | number  | `0.92`  | above 0 to 1  | Compressed-to-raw size ratio above which a message is flagged |

Lower values catch more and also charge more legitimate ids, hashes, and keys.

**When to enable.** Run in `audit` first and watch the findings. Escalate to
`enforce` once you know your normal traffic. Legitimate hashes, keys, and
encoded attachments count against the budget too.

**Cost.** One compression pass per payload. In `enforce` mode at the tool-result
chokepoint, a page or file full of encoded data can be withheld.

### Replay sentinel

Plugin `egress-replay-sentinel`, priority 35, default `audit`. Runs at all four
chokepoints.

**What it detects.** A message that repeats an earlier one to the same
destination with only cosmetic differences (case, spacing, trailing
punctuation). The difference is where hidden bits would live. Messages with
different content, such as different order numbers, are never flagged.

**Example.** `Status: OK` followed later by `status: ok.` is flagged, and the
differing characters are recorded in the ledger.

**Options.**

| Option           | Type    | Default | Range     | Effect                                                       |
| ---------------- | ------- | ------- | --------- | ------------------------------------------------------------ |
| `historyPerSink` | integer | `16`    | 1 to 1024 | Earlier messages per destination each new one is compared to |

**When to enable.** Any time; it is detection only and never rewrites or blocks.

**Cost.** Negligible.

### Noise injector

Plugin `egress-noise-injector`, priority 40, default `audit`. Runs at all four
chokepoints.

**What it removes.** Visible details a reader does not notice:

- runs of spaces or tabs become one space, and three or more blank lines become
  two;
- curly quotes, en and em dashes, the ellipsis character, and no-break space
  become plain ASCII;
- repeated `!`, `?` or `.` become a single one.

**Example.** `Done!!!  See you…` becomes `Done! See you...`.

**Options.** Each transform can be switched off on its own.

| Option                    | Type    | Default | Effect                                        |
| ------------------------- | ------- | ------- | --------------------------------------------- |
| `collapseWhitespaceRuns`  | boolean | `true`  | Collapse runs of spaces, tabs and blank lines |
| `normalizeTypography`     | boolean | `true`  | Map typographic variants to plain ASCII       |
| `collapsePunctuationRuns` | boolean | `true`  | Collapse repeated `!`, `?` or `.` to one      |

**When to enable.** Escalate to `enforce` when messages are read by people, not
parsed by machines. Do not enforce it where exact formatting matters, for
example code blocks or preformatted tables with aligned spaces.

**Cost.** Mildly lossy: a deliberate double space or ellipsis is normalized.

### Semantic scrambler

Plugin `egress-semantic-scrambler`, priority 45, default `audit`. Runs at all
four chokepoints.

**What it removes.** Word-choice channels, deterministically and without a
model:

- synonyms in 24 curated groups collapse to the first word of the group (for
  example `huge`, `massive`, `enormous` all become `large`);
- contractions expand to one full form (`it's` becomes `it is`);
- simple agentive passive sentences with regular verbs become active
  (`The file was deleted by Alice` becomes `Alice deleted the file`).

Whatever variant the sender chose, the output is the same, so the choice
carries nothing.

**Options.**

| Option                 | Type    | Default | Effect                                                    |
| ---------------------- | ------- | ------- | --------------------------------------------------------- |
| `enabled`              | boolean | `true`  | `false` skips registering the stage when the plugin loads |
| `expandContractions`   | boolean | `true`  | Expand contractions to one full form                      |
| `canonicalizeSynonyms` | boolean | `true`  | Collapse curated synonym groups to one word               |
| `passiveToActive`      | boolean | `true`  | Rewrite simple agentive passive sentences as active       |

**When to enable.** When outbound prose is read by people and you want to close
the word-choice channel without the cost of a model call. Pick this or the LLM
scrambler, not both.

**Cost.** Changes the sender's exact wording. Only words in the curated groups
are affected; synonyms outside them pass through.

### LLM scrambler

Plugin `egress-llm-scrambler`, priority 46, default `audit`. Runs at all four
chokepoints.

**What it removes.** Every linguistic encoding at once. The payload is rephrased
by a model under a fixed instruction: keep the meaning exactly, change the
wording and structure as much as possible, treat the input strictly as data,
and output only the rephrased text. The instruction is compiled in; no config,
environment variable, or runtime input can change it, so it cannot be turned
into a pass-through or an exfiltration aid.

**Wiring.** The mediator connects the stage to a model when its `llm.enabled`
is true (the default). Each rephrase is a single tool-less turn in a temporary
session, on the configured default model unless `llm.provider` and `llm.model`
name another.

| Mediator option | Type    | Default       | Effect                         |
| --------------- | ------- | ------------- | ------------------------------ |
| `llm.enabled`   | boolean | `true`        | Connect the stage to a model   |
| `llm.provider`  | string  | default model | Provider for the rephrase turn |
| `llm.model`     | string  | default model | Model for the rephrase turn    |
| `llm.timeoutMs` | number  | `30000`       | Per-rephrase timeout           |

| Plugin option | Type    | Default | Effect                                                    |
| ------------- | ------- | ------- | --------------------------------------------------------- |
| `enabled`     | boolean | `true`  | `false` skips registering the stage when the plugin loads |

The former `maxChars` option is retired: it let a payload padded past the limit
pass unscrambled. A config that still sets it is refused. A payload longer than
one model call (8000 characters, fixed) is split at whitespace and every piece
is rephrased; length never exempts a payload.

**Failure behavior.** In `enforce` mode it fails closed. If no model is
connected, or the model fails, times out, or returns nothing, the payload is
blocked and an `llm-unavailable` or `llm-error` finding is recorded. In
`audit` mode it never blocks.

**When to enable.** When you need the strongest wording defense and can afford a
model call per payload. Pick this or the semantic scrambler, not both. A local
model keeps the text on the host.

**Audit mode.** In `audit` mode the stage never calls the model. It records an
`llm-rephrase-audit` finding for each payload that enforce would send to the
rephraser (or block, when no model is connected), and the payload passes
unchanged. Audit mode therefore shows how much traffic the stage
would touch, not what the rephrase would look like.

**Cost.** In `enforce` mode, one model call per channel message and per text
block the model would read at the tool-result and inbound chokepoints. A tool
call's string arguments are rephrased one call per argument, so the argument
structure survives. Output is not deterministic.

### Timing scrambler

Plugin `egress-timing-scrambler`, priority 48, default `audit`. Runs at all four
chokepoints; its delay applies only to channel sends and tool calls.

**What it removes.** Timing signals. Before each outbound payload it waits a
random time drawn from a cryptographic random source, uniformly between 0 and
750 ms. An attacker who encodes bits in short and long gaps sees each gap
disturbed by the difference of two independent random delays.

**Options.**

| Option       | Type    | Default | Range       | Effect                                                    |
| ------------ | ------- | ------- | ----------- | --------------------------------------------------------- |
| `enabled`    | boolean | `true`  |             | `false` skips registering the stage when the plugin loads |
| `minDelayMs` | integer | `0`     | 0 to 600000 | Shortest random delay; must not exceed `maxDelayMs`       |
| `maxDelayMs` | integer | `750`   | 0 to 600000 | Longest random delay                                      |

**When to enable.** A cheap, always-on reduction of timing channels. It lowers
capacity; it does not drive it to zero (see the
[measurements](#measure-it-yourself)).

**Cost.** Up to `maxDelayMs` (750 ms by default) added latency per send. A tool
call is one send, however many arguments it has.

### Behavioral invariants

Plugin `egress-behavioral-invariants`, priority 50, default `audit`. Runs at all
four chokepoints.

**What it limits.** Side channels across messages, tracked per destination:

- **Rate and volume:** more than 60 payloads or more than 262144 characters in
  a rolling 60-second window is cancelled (slow-drip exfiltration).
- **Periodicity:** after 8 intervals, near-constant spacing between messages
  (coefficient of variation below 0.08) is flagged as a possible timing
  channel.
- Minimum interval, send-time quantization with jitter, and constant-rate paced
  release are off by default and switched on in plugin config.

**Options.**

| Option                 | Type    | Default  | Effect                                                                             |
| ---------------------- | ------- | -------- | ---------------------------------------------------------------------------------- |
| `windowMs`             | integer | `60000`  | Rolling window for the rate and volume limits (1 to 86400000)                      |
| `maxMessagesPerWindow` | integer | `60`     | Most sends per destination per window (1 or more)                                  |
| `maxBytesPerWindow`    | integer | `262144` | Most characters per destination per window (1 or more)                             |
| `minIntervalMs`        | integer | `0`      | Minimum spacing between sends; a faster send is delayed (0 = off)                  |
| `timingQuantumMs`      | integer | `0`      | Snap send times to a grid of this many ms (0 = off)                                |
| `jitterMs`             | integer | `0`      | Random jitter on top of quantization (0 = off); requires `timingQuantumMs` above 0 |
| `releaseCadenceMs`     | integer | `0`      | Constant-rate paced release: sends leave at least this far apart (0 = off)         |

For the strongest timing defense, set `releaseCadenceMs` (for example `2000`)
and the stage mode to `enforce`. `jitterMs` without `timingQuantumMs` is
refused, because jitter only applies on top of quantization.

**When to enable.** Escalate to `enforce` after you know your peak message rate.

**Cost.** In `enforce` mode, bursts beyond the limits are dropped, and paced
release or quantization queues sends. A tool call counts as one payload toward
the rate limit, however many arguments it has.

### Cover traffic

Plugin `egress-cover-traffic`. A background service, not a pipeline stage. Off
by default.

**What it hides.** Whether, and how often, the agent is sending. It sends a
fixed filler message to a configured destination on a schedule, so the
presence of traffic says less about real activity.

**Wiring.** The mediator backs the service with the target channel's outbound
send path when its `coverTraffic.enabled` is true (the default). Filler is sent
directly through the channel; it does not pass through the pipeline.

| Plugin option    | Type                        | Default         | Effect                                                                                                                                                           |
| ---------------- | --------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`        | boolean                     | `false`         | Start the service                                                                                                                                                |
| `mode`           | `"constant"` or `"poisson"` | `"poisson"`     | `constant`: one filler every `meanIntervalMs`. `poisson`: check at random exponential intervals, and send when `meanIntervalMs` has passed since the last filler |
| `meanIntervalMs` | integer                     | `60000`         | Mean spacing of filler, 1000 to 86400000                                                                                                                         |
| `coverContent`   | string                      | `"[keepalive]"` | Filler text                                                                                                                                                      |
| `target.to`      | string                      | none            | Recipient; required when `enabled` is true or `target` is set                                                                                                    |
| `target.channel` | string                      | none            | Channel id; required for sending                                                                                                                                 |

The config fails closed, like the mediator's: an unknown key, a wrong type, an
out-of-range interval, or `enabled: true` without `target.to` refuses
gateway start instead of running a service that sends no cover.

**When to enable.** Only for a destination you control, such as a dedicated
log channel. Real recipients will see the filler.

**Real traffic is its own cover.** Every successfully delivered real channel
message resets the idle clock, so filler is only sent once no real message has
gone out for `meanIntervalMs`. An active agent generates little or no filler.

**Cost.** Up to one extra message per interval while the agent is idle.

### Image scrambler

Plugin `egress-image-scrambler`. A media scrambler, not a text stage.

**What it removes.**

- **Pixel least-significant bits:** every red, green, blue, and alpha
  (transparency) value is snapped to 64 levels (6 bits per channel). That
  destroys both bit 0 and bit 1 of every channel, so an attacker who moves the
  payload up one bit, or into the alpha channel, is still defeated, while each
  value changes by at most 2 out of 255, which is not visible. Fully opaque and
  fully transparent pixels are unchanged.
- **Image brightness across a series:** the mean brightness of each image is
  snapped to one of 8 levels, so it can carry at most 3 bits per image.

**Options.**

| Option                | Type                | Default | Effect                                                                                          |
| --------------------- | ------------------- | ------- | ----------------------------------------------------------------------------------------------- |
| `enabled`             | boolean             | `true`  | `false` skips registering the scrambler when the plugin loads                                   |
| `colorSpace`          | `"rgb"` or `"cmyk"` | `"rgb"` | Basis for the requantization. `cmyk` gives the same bit defense at slightly more visible change |
| `depthLevels`         | integer             | `64`    | Levels per channel, alpha included (2 to 256). `128` clears only bit 0; `256` turns it off      |
| `luminanceBuckets`    | integer             | `8`     | Brightness levels per image (1 to 256), bounding that channel to log2(buckets) bits; `1` is off |
| `colorSpaceRoundtrip` | boolean             | none    | Deprecated alias for `colorSpace`: `true` means `cmyk`, `false` means `rgb`                     |

Setting `colorSpaceRoundtrip` and `colorSpace` to conflicting values is an
error.

### Audio scrambler

Plugin `egress-audio-scrambler`. A media scrambler, not a text stage.

**What it removes.** It takes the Fourier transform of the clip, zeroes every
frequency outside the audible band, zeroes every frequency much quieter than
the loudest one, and transforms back. Ultrasonic and subsonic carriers, and
faint narrowband tones hidden under speech or music, are removed; what a person
hears is kept.

**Example.** A data tone at 21 kHz, or a tone 60 dB below the speech it is mixed
into, is gone after scrambling.

**Options.** All options are applied. Invalid values stop the plugin from
loading rather than silently weakening it.

| Option              | Type    | Default | Effect                                                                                                      |
| ------------------- | ------- | ------- | ----------------------------------------------------------------------------------------------------------- |
| `enabled`           | boolean | `true`  | `false` skips registering the scrambler                                                                     |
| `minHz`             | number  | `20`    | Zero energy below this frequency. Must be 0 or more, and below `maxHz`                                      |
| `maxHz`             | number  | `20000` | Zero energy above this frequency. Must be above 0                                                           |
| `perceptualFloor`   | number  | `0.003` | Zero frequencies below this fraction of the loudest one. About -50 dB. Range 0 to below 1; `0` turns it off |
| `perceptualFloorDb` | number  | none    | The same floor in dB relative to the loudest frequency, for example `-50`. Must be 0 or less                |

Set `perceptualFloor` or `perceptualFloorDb`, not both; setting both is an
error. A higher floor (for example `-40` dB) removes louder hidden tones but
also more quiet detail in real audio.

### Media exemptions, ordering, and where media is mediated

The media scramblers are aggressive by design, and no content classifier can
reliably tell real speech from audible-band data, or a real chart from a crafted
image. So by default **every** image and audio payload is treated as suspect and
scrambled.

A host that has its own way to prove a payload was produced legitimately can
install a media-exemption check (`setMediaExemptionCheck` in
`@enclawed/egress-core`). A payload the check accepts passes unchanged. The
open core installs no check, so nothing is exempt; a check that throws or
returns anything but `true` exempts nothing.

The core library also provides `canonicalMediaOrder`, which reorders a batch of
media by SHA-256 of its content before sending. That removes the channel in
_which order_ images are sent (up to log2(N!) bits for N images). Exempt items
keep their order and go first.

**Where media is mediated.** The egress mediator's media chokepoint covers the
attachments of every outbound channel message sent through the gateway's
outbound delivery path (the `media_sending` hook). The gateway loads each
attachment under the same media-access policy the channel would apply and hands
the bytes to the mediator, which:

1. decodes images (any raster format the bundled image library reads; the first
   frame of an animation) and PCM WAV audio;
2. runs every registered media scrambler on them, each in its own mode
   (`egress-image-scrambler`, `egress-audio-scrambler`; default `audit`);
3. puts the batch into canonical content-hash order (`egress-media-order`,
   default `audit`). Attachments that are neither image nor audio (video,
   documents) keep their bytes and, when ordering enforces, follow the decoded
   media in SHA-256 order;
4. re-encodes what changed. A scrambled image is sent as PNG, which is lossless
   and carries no metadata (EXIF and text chunks are dropped); scrambled audio
   keeps its WAV format.

The chokepoint is on whenever the mediator is enabled (`media.enabled`, default
`true`) and does nothing until a media scrambler plugin is enabled or
`egress-media-order` is set to `enforce`. In `audit` mode it records what it
would change and sends the originals. While the mediator is enabled, the
gateway loads each outbound attachment once more for this chokepoint, even
before a media scrambler is on; set `media.enabled: false` to skip that.

It fails closed. An image or audio attachment that cannot be decoded while the
scrambler for its kind enforces (for example MP3, Ogg or Opus audio, which the
open codec does not read), an enforcing scrambler that throws, or an attachment
the gateway cannot load cancels the message. Channel plugins that deliver
replies through their own send path instead of the gateway's outbound delivery
are not covered by this chokepoint, as for the channel-send chokepoint.

Applications with their own media chokepoint can call `mediateMediaBatch` from
`enclawed/framework`, which runs the same scramblers and ordering on decoded
payloads.

The enclawed-enclaved edition adds a signed media-legitimacy attestation that
exempts approved media from scrambling.

## Action batcher

The action batcher (`extensions/egress-action-batcher`) shrinks choice-type covert channels. In these channels the information is in which allowed actions an agent takes, in what order, and how many times, not in what any action carries. For k actions per window chosen from N allowed actions, the sequence channel carries k·log2(N) bits, the multiset channel log2(C(N+k−1, k)) bits, and the subset channel N bits. The egress mediator applies the batcher at the tool-call chokepoint. Applications with their own chokepoints can call `createActionBatcher` from `@enclawed/egress-core`.

Three defenses each remove one layer:

- **Canonical order** (`canonicalOrder`, default on). The batcher buffers a window's actions and releases them sorted by SHA-256 of the canonical encoding of what leaves the host (for `web_fetch`, the GET of its URL reduced to the request line actually sent: the fragment and a bare `?` are dropped, percent-encoding is kept as written; `extractMode` and `maxChars` never leave the host and are not part of the key). The sort is deterministic, never a shuffle. This removes the sequence channel and leaves the multiset.
- **Idempotent-repeat collapse** (`collapseIdempotentRepeats`, default on). Repeating an action is only a covert signal when the repeat has the same effect as doing it once; otherwise the repetition is visible. So repeats of an idempotent action collapse to one within the window. For the rest of the run, a repeat of a side-effect-free request is answered from a recorded outcome instead of being re-sent, error answers included. Within one run, a repeated read may be answered from a recent copy. A record is cleared only by an action that may change what it reads (an unsafe-method HTTP request to its origin, or a side-effecting tool call or send that names its origin). The host's tool replay seam reproduces the recorded result exactly, so the agent sees the result it would have had. This leaves the subset.
- **Padding** (`padding`, default off). Each active window issues the full allowed set on a fixed window grid, using only GET, HEAD and OPTIONS. The dummies run the padded tool's own request path (`web_fetch`: same headers, SSRF guard, byte limit and cancel, error-body limit and provider fallback), in lockstep with the real requests: every real request waits at its issue slot, and the slots open in canonical order. The observed set is then constant, so the per-window choice capacity is 0 for requests in the set. A request outside the set leaks its identity, at most 9 bits per wire byte plus 1; that is charged to the capacity ledger before release, and the window holds up to 10 s and then refuses it when the ledger cannot pay. Padding fails closed when no request client exists. A dummy that fails in flight fails as a real request of the same URL would, so it blocks nothing. The cost is bandwidth and grid latency.

`windowMs` (default 250 ms) bounds both the coverage of a window and the latency it adds.

Idempotency comes from a fixed table, never a guess:

- GET, HEAD and OPTIONS, and tools that are read-only per the open core's tool capability map, are cacheable.
- PUT, DELETE and identical file writes collapse within a window only, because they have side effects.
- POST, messages, sends and unknown actions are never collapsed. Classification fails toward overt.

An action whose input came from an earlier result (data flow) is still concurrent with the rest of its window, because nothing in an open window has completed, so it is sorted, collapsed and cached like any other action. Only an explicit ordering dependency (`dependsOn`) is a barrier: barriers are released after the rest of the window in arrival order, and their designation and order, log2 C(m, d) + log2(d!) bits for d barriers among m actions, are charged to the capacity ledger. The egress mediator never sets `dependsOn`, so nothing the agent controls makes a barrier.

Measured with `pnpm bench:covert` (k=16 GET requests from N=16 allowed URLs, decoded bits, 2000 trials per cell):

| Encoding      | Undefended | Canonical order | Order + collapse | Order + collapse + padding |
| ------------- | ---------- | --------------- | ---------------- | -------------------------- |
| sequence      | 63.95      | 0.24            | 0.07             | 0.00                       |
| multiset      | 27.98      | 27.98           | 0.00             | 0.00                       |
| subset        | 15.99      | 15.99           | 15.99            | 0.00                       |
| best encoding | 63.95      | 27.98           | 15.99            | 0.00                       |

The batcher can only reorder actions that are in flight together. An agent that issues one call at a time gets a window of one action; for it, only repeat collapse applies. Plugin options and the full idempotency table: `extensions/egress-action-batcher/README.md`.

## Enable it

The plugins are bundled but not enabled by default. Enable the mediator and the
stages you want:

```bash
enclawed plugins enable egress-mediator
enclawed plugins enable egress-canonicalizer
enclawed plugins enable egress-taint-tracker
enclawed plugins enable egress-entropy-scanner
enclawed plugins enable egress-replay-sentinel
enclawed plugins enable egress-noise-injector
enclawed plugins enable egress-semantic-scrambler
enclawed plugins enable egress-timing-scrambler
enclawed plugins enable egress-behavioral-invariants
```

Restart the gateway after config changes. A minimal, safe starting point
(lossless stages enforcing, everything else in audit) needs no config beyond
enablement.

A stricter setup in config:

```json5
{
  plugins: {
    entries: {
      "egress-mediator": {
        enabled: true,
        config: {
          // Mediate tool arguments, tool results and inbound messages too.
          toolCall: { enabled: true },
          modelInput: { enabled: true, toolResults: true, inbound: true },
          ledger: { capacityBits: 2048, refillBitsPerSec: 64 },
          stages: {
            "egress-entropy-scanner": { mode: "enforce" },
            "egress-noise-injector": { mode: "enforce" },
            "egress-semantic-scrambler": { mode: "enforce" },
            "egress-timing-scrambler": { mode: "enforce" },
            "egress-behavioral-invariants": { mode: "enforce" },
          },
        },
      },
      "egress-canonicalizer": { enabled: true },
      "egress-taint-tracker": { enabled: true },
      "egress-entropy-scanner": { enabled: true },
      "egress-replay-sentinel": { enabled: true },
      "egress-noise-injector": { enabled: true },
      "egress-semantic-scrambler": { enabled: true },
      "egress-timing-scrambler": { enabled: true },
      "egress-behavioral-invariants": { enabled: true },
      "egress-audio-scrambler": { enabled: true, config: { perceptualFloorDb: -50 } },
    },
  },
}
```

### Mediator options

| Option                    | Type                       | Default                                                                              | Effect                                                              |
| ------------------------- | -------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `enabled`                 | boolean                    | `true`                                                                               | Master switch; `false` makes every chokepoint a pass-through        |
| `posture`                 | `"default"` or `"enforce"` | `"default"`                                                                          | `enforce` sets every stage to `enforce`; `stages` entries still win |
| `stages.<stage-id>.mode`  | `enforce`, `audit`, `off`  | see [Modes](#modes-audit-enforce-off)                                                | Per-stage mode                                                      |
| `ledger.capacityBits`     | number                     | `4096`                                                                               | Ledger bucket size                                                  |
| `ledger.refillBitsPerSec` | number                     | `256`                                                                                | Ledger refill rate; `0` means no refill                             |
| `toolCall.enabled`        | boolean                    | off; on in the hardened posture                                                      | Mediate outbound tool arguments                                     |
| `toolCall.tools`          | string array               | `message`, `sessions_send`, `web_fetch`, `web_search`, `x_search`, `browser`, `tlon` | Tools whose arguments are always mediated                           |
| `toolCall.commandTools`   | string array               | `exec`, `bash`                                                                       | Shell tools mediated only when the command reaches the network      |
| `modelInput.enabled`      | boolean                    | off; on in the hardened posture                                                      | Mediate what enters the model context                               |
| `modelInput.toolResults`  | boolean                    | `true`                                                                               | Include tool results (when `modelInput.enabled`)                    |
| `modelInput.inbound`      | boolean                    | `true`                                                                               | Include inbound channel messages (when `modelInput.enabled`)        |
| `llm.*`                   |                            |                                                                                      | See [LLM scrambler](#llm-scrambler)                                 |
| `coverTraffic.enabled`    | boolean                    | `true`                                                                               | Back the cover-traffic service with the channel send path           |
| `media.enabled`           | boolean                    | `true`                                                                               | Mediate outbound attachments (inert until a media scrambler is on)  |

The mediator's config fails closed, like the stage plugins. If the config has
an unknown key at any level, a wrong type, or an out-of-range value, the
mediator fails to register (the loader reports `failed during register` with
the reason), and because the mediator is a security stage the gateway then
refuses to start.
The config does not fall back to a default. For example:

- `ledger.capacityBits` must be a number greater than 0.
- `ledger.refillBitsPerSec` must be 0 or more.
- `llm.timeoutMs` must be an integer from 1 to 600000. It is a hard deadline:
  when it passes the model turn is aborted and, in enforce mode, the LLM
  scrambler blocks the payload. A turn that was aborted, ended in an error, or
  returned an error payload is never used as a rephrase.
- Tool lists must hold non-empty strings.
- `stages` accepts only the built-in stage ids, and each entry needs a valid
  `mode`. A misspelled id is refused, because it would leave the real stage at
  its default.

An omitted key keeps its default.

### Hardened posture defaults

With `ENCLAWED_FLAVOR=enclaved` (or an alias), a security stage's settings can
only be tightened:

- Every stage enforces, including the lossy and detection stages and any
  third-party stage, because audit mode passes the payload through unchanged.
  `posture: "default"` and a `stages.<id>.mode` of `audit` or `off` refuse
  gateway start; `enforce` is accepted.
- The tool-call, tool-result and inbound-message chokepoints are on. `enabled`,
  `toolCall.enabled`, `modelInput.enabled`, `modelInput.toolResults`,
  `modelInput.inbound`, `coverTraffic.enabled` and `media.enabled` set to
  `false` refuse gateway start. `llm.enabled: false` is accepted: without the
  completer the LLM scrambler blocks every payload instead of passing it.
- A security stage the profile enables by default (the mediator, the
  canonicalizer, the taint tracker, the action batcher) cannot be switched off
  with `plugins.entries.<id>.enabled: false`, `plugins.enabled: false`,
  `plugins.deny`, or a `plugins.allow` list that leaves it out, and it must
  load. A stage plugin's own `enabled: false`, or a `mode` of `audit` or
  `off`, refuses start for every enabled stage. A config reload with any of
  these is refused too.

Ledger sizing is the same as in the open posture.

## What cannot be driven to zero

The suite reduces capacity; it does not eliminate it. What remains:

- **Choice channels.** Any time an agent legitimately chooses among N allowed
  options, the choice can carry up to log2(N) bits: which true fact to mention,
  how many items to list, how to round a number, which allowed URL to fetch.
  Rewriting the _form_ of a message cannot remove information carried by its
  _content_, because the content is the point of the message. The scramblers
  remove the form channels; the action batcher shrinks order and repetition of
  actions; the rest is bounded only by rate limits and the ledger.
- **Word choice outside the curated groups.** The semantic scrambler only knows
  24 synonym groups. The LLM scrambler covers far more, but a model rephrase
  keeps meaning by design, so meaning-level choices survive it.
- **Timing.** Random delay lowers timing capacity but does not reach zero. Only
  constant-rate paced release (`releaseCadenceMs` in the behavioral-invariants
  plugin config) does.
- **Message size and count** within the rate and volume limits, and the
  presence of traffic when cover traffic is off.
- **Numeric precision** and other structured fields: no stage normalizes the
  digits of a number.
- **Image brightness** is bounded to 3 bits per image, not removed.
- **Media the open codec cannot decode** (compressed audio, video, documents)
  is not scrambled. Compressed audio and undecodable images are blocked while
  the matching scrambler enforces; video and documents pass with their bytes
  unchanged.
- **Audio** louder than the perceptual floor, including data sonified into the
  audible band, is kept.
- **Detection stages measure, they do not remove.** The entropy scanner and
  replay sentinel only stop traffic once the ledger is exhausted (entropy, in
  `enforce` mode) or never (replay).
- **Application layer only.** The suite mediates what Enclawed itself sends and
  receives. It does not mediate the operating system, the network stack, the
  CPU, or other processes on the host. Those need system-level controls.

## Measure it yourself

The benchmark measures every number from the open code: working encoders,
the shipped stages behind the real mediator, and receiver-side decoders. It
reports **reduction** as one minus the mutual information between the hidden
bits and what the receiver decodes (100 means the receiver learns nothing) and
receiver accuracy (50% is a coin flip).

```bash
pnpm bench:covert          # tables, side by side with the paper
pnpm bench:covert --json   # machine-readable results
```

Setup used by the benchmark: "default" is the shipped stage modes; "enforce"
sets the text stages to `enforce` with a 64-bit ledger and no refill so the
budget binds; the LLM scrambler, cover traffic, and media exemption are not
used; the timing rows build the stages with explicit options in code. Wall-clock
delay is not slept; the timing channel is evaluated on the computed release
times.

Current output:

**Text channels at the channel chokepoint** (20 trials per cell)

| channel                   | default | enforce | detected | enforce acc% |
| ------------------------- | ------- | ------- | -------- | ------------ |
| zero-width-interleave     | 100.0   | 100.0   | 100.0    | 48.1         |
| unicode-tag-append        | 100.0   | 100.0   | 100.0    | 48.1         |
| variation-selector-append | 100.0   | 100.0   | 100.0    | 48.1         |
| bidi-control-append       | 100.0   | 100.0   | 100.0    | 48.1         |
| homoglyph-substitution    | 100.0   | 100.0   | 100.0    | 48.1         |
| whitespace-count          | 0.3     | 100.0   | 100.0    | 48.1         |
| punctuation-count         | 0.9     | 100.0   | 100.0    | 45.4         |
| synonym-substitution      | 0.3     | 100.0   | 100.0    | 48.1         |
| json-key-ordering         | 100.0   | 100.0   | 100.0    | 48.1         |
| base64-blob               | 0.0     | 100.0   | 100.0    | 49.3         |
| timing-interval           | --      | 100.0   | --       | 47.0         |
| text mean                 | 60.2    | 100.0   |          |              |

In the default posture, the lossless carriers are already removed; the visible
carriers (spacing, punctuation, synonyms, base64) are detected every time but
only removed once their stages enforce.

**Full enforcement at every chokepoint**

| channel                   | channel send | tool-call args | tool result | inbound message |
| ------------------------- | ------------ | -------------- | ----------- | --------------- |
| zero-width-interleave     | 100.0        | 100.0          | 100.0       | 100.0           |
| unicode-tag-append        | 100.0        | 100.0          | 100.0       | 100.0           |
| variation-selector-append | 100.0        | 100.0          | 100.0       | 100.0           |
| bidi-control-append       | 100.0        | 100.0          | 100.0       | 100.0           |
| homoglyph-substitution    | 100.0        | 100.0          | 100.0       | 100.0           |
| whitespace-count          | 100.0        | 100.0          | 100.0       | 100.0           |
| punctuation-count         | 100.0        | 100.0          | 100.0       | 100.0           |
| synonym-substitution      | 100.0        | 100.0          | 100.0       | 100.0           |
| json-key-ordering         | 100.0        | 100.0          | 100.0       | 100.0           |
| base64-blob               | 100.0        | 100.0          | 100.0       | 100.0           |

**Linguistic channels through the semantic scrambler**

| channel              | undefended | scrambled | acc% | idempotent |
| -------------------- | ---------- | --------- | ---- | ---------- |
| synonym-choice-1bit  | 0.1        | 100.0     | 51.6 | true       |
| synonym-choice-2bit  | 0.1        | 100.0     | 51.6 | true       |
| contraction-form     | 0.1        | 100.0     | 51.6 | true       |
| voice-active-passive | 0.1        | 100.0     | 51.6 | true       |

**Image pixel least-significant bits** (128x128 cover; bit 0 is the naive
attacker, bit 1 the aware one)

| defense                     | bit-0 acc | bit-1 acc | bit-0 reduction | bit-1 reduction |
| --------------------------- | --------- | --------- | --------------- | --------------- |
| RGB 256 (no defense)        | 100.0     | 100.0     | 0.0             | 0.0             |
| RGB 128 (7 bits/ch)         | 50.0      | 100.0     | 100.0           | 0.0             |
| RGB 64 (6 bits/ch, default) | 50.6      | 50.0      | 100.0           | 100.0           |
| RGB 32 (5 bits/ch)          | 50.8      | 51.3      | 100.0           | 100.0           |

The benchmark also prints a design-space table comparing CMYK, K-only, random,
and mixed-depth variants; uniform 6-bit RGB is the cheapest setting that
defeats the aware attacker.

**Cross-image carriers**

| channel                       | defense          | bound (bits) | measured (bits) | receiver acc% |
| ----------------------------- | ---------------- | ------------ | --------------- | ------------- |
| mean luminance (1 bit/image)  | undefended       | 8.00         | 1.00            | 100.0         |
| mean luminance (1 bit/image)  | bucket B=8       | 3.00         | 1.00            | 100.0         |
| mean luminance (1 bit/image)  | bucket B=2       | 1.00         | 1.00            | 100.0         |
| sequence ID (4! permutations) | undefended       | 4.58         | 4.09            | 100.0         |
| sequence ID (4! permutations) | sha256 canonical | 0.00         | 0.00            | 3.4           |

Brightness bucketing bounds the channel; a 1-bit-per-image signal fits inside
the bound and survives. Content-hash ordering removes the order channel.

**Audio carriers**

| carrier                 | defense          | reduction | receiver acc% |
| ----------------------- | ---------------- | --------- | ------------- |
| ultrasonic (>20 kHz)    | none             | 0.4       | 100.0         |
| ultrasonic (>20 kHz)    | FFT band-limit   | 100.0     | 53.1          |
| sub-perceptual (-60 dB) | none             | 0.1       | 100.0         |
| sub-perceptual (-60 dB) | perceptual floor | 100.0     | 48.8          |
| sub-perceptual (-70 dB) | none             | 0.1       | 100.0         |
| sub-perceptual (-70 dB) | perceptual floor | 100.0     | 48.8          |

**Timing side channel**

| defense                                       | reduction | receiver acc% |
| --------------------------------------------- | --------- | ------------- |
| undefended                                    | 0.4       | 100.0         |
| random delay up to 750 ms (default)           | 76.1      | 78.0          |
| random delay up to 4000 ms                    | 98.8      | 56.7          |
| behavioral: no timing defense                 | 0.5       | 100.0         |
| behavioral: quantization 1 s + 250 ms jitter  | 82.0      | 74.0          |
| behavioral: constant-rate paced release (2 s) | 100.0     | 47.0          |

The benchmark does not reproduce the paper's media-attestation table, because
that attestation is not part of the open code.

## Use the stages in your own application

An application that owns its own chokepoints (for example a hook that rewrites a
tool's output before an agent sees it) can run the same pipeline without the
gateway. `enclawed/framework` exports `createEgressRunner`, the stage builders
(`buildCanonicalizerStage`, `buildTaintTrackerStage`, `buildEntropyScannerStage`,
`buildReplaySentinelStage`, `buildNoiseInjectorStage`,
`buildSemanticScramblerStage`, `buildTimingScramblerStage`,
`buildBehavioralInvariantsStage`), `createTaintStore`, the taint-tagging API
(`tagSensitiveValue`, `sharedTaintStore`, `TAINT_SCOPE_ALL`),
`mediateMediaBatch`, and the stage ids and default modes.

```ts
import {
  buildBehavioralInvariantsStage,
  buildCanonicalizerStage,
  buildTaintTrackerStage,
  createEgressRunner,
} from "enclawed/framework";

const run = createEgressRunner({
  stages: [
    buildCanonicalizerStage(),
    buildTaintTrackerStage(),
    buildBehavioralInvariantsStage({ releaseCadenceMs: 2000 }),
  ],
  config: { stages: { "egress-behavioral-invariants": { mode: "enforce" } } },
});

const result = await run(text, { kind: "model-input", id: "my-hook" });
// result.cancelled ? withhold : use result.content (and result.delayMs if you apply delays)
```

The runner reports delays instead of sleeping; your chokepoint decides whether
to apply them. Stage builders take the same options as the plugin config.

To keep a specific value from leaving, tag it. The shared taint store is
process-wide, so a tag is seen by the taint-tracker stage in your own pipeline
and in the gateway alike:

```ts
import { tagSensitiveValue } from "enclawed/framework";

// Checked at every destination:
tagSensitiveValue(sessionCanary, { label: "session-canary" });
// Checked only for one conversation:
tagSensitiveValue(customerRecord, { scope: conversationId, label: "customer-record" });
```

In `enforce` mode, a payload that carries a tagged value (even lightly
reformatted) is cancelled.

## Further reading

- The paper behind the suite: Alfredo Metere, _An Application-Layer
  Multi-Modal Covert-Channel Reference Monitor for LLM Agent Egress_,
  [arXiv:2605.20734](https://arxiv.org/abs/2605.20734).
- [Editions and Hardening](/reference/editions-and-hardening)
- [Security](/gateway/security)
- [Plugins](/tools/plugin)
