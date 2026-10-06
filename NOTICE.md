# enclawed-oss — copyright and license notice

This directory (`enclawed-oss/`) is released under the MIT License (see
[`LICENSE`](LICENSE)). It bundles two layers of copyright:

## 1. Upstream OpenClaw

The base of this directory is a hard fork of
[OpenClaw](https://github.com/openclaw/openclaw), copyright (c) 2025
Peter Steinberger, licensed under MIT. Per the MIT terms, that
upstream copyright notice and license text are preserved in
[`LICENSE`](LICENSE) and must remain in any redistribution.

## 2. enclawed-oss additions

The framework, audit log, classification scheme, signing toolkit,
human-in-the-loop controller, transaction buffer, prompt shield,
egress guard, and accompanying test suite, paper, and CI workflows
are copyright (c) 2026 Enclawed LLC and are also released
under the MIT License.

The MIT additions are compatible with the upstream MIT license; no
GPL, AGPL, or other copyleft code is incorporated into
`enclawed-oss/`.

The "enclawed" name applies to the fork; the upstream project is
"OpenClaw" and references to OpenClaw above are deliberate attribution
to the original work.

## What this notice does NOT cover

The closed-source extensions in the sibling directory
`../enclawed-enclaved/` are governed by a SEPARATE proprietary
license; see [`../enclawed-enclaved/LICENSE`](../enclawed-enclaved/LICENSE).
Importing MIT-licensed code from `enclawed-oss/` into a proprietary
project is permitted by MIT; the proprietary code does NOT thereby
acquire MIT terms.

## Trademark

"OpenClaw" may be a trademark of the upstream project's authors.
"enclawed" is used here as the name of the fork; no claim to upstream
trademarks is made or implied. Before publishing under either name,
the publisher should perform a trademark search appropriate to its
jurisdictions.

## Contributor agreements

Any code contributed to `enclawed-oss/` after the dual-license split
should be accepted only under MIT terms (or, at the publisher's
discretion, under a Developer Certificate of Origin or Contributor
License Agreement that grants the publisher MIT-compatible rights).
Contributions accepted without explicit MIT terms cannot be shipped
under MIT.

## Disclaimer

This notice is for transparency, not legal advice. The licensing
posture described here was assembled from common open-core practice;
the publisher (Enclawed LLC) is responsible for
independently verifying with qualified counsel that:

- the publisher actually holds copyright to the contributions credited
  above (employment agreements, work-for-hire, no third-party
  contamination);
- no incompatible third-party code (GPL, AGPL, license-restricted
  proprietary fragments, etc.) has been incorporated;
- the trademark posture is sound in the publisher's intended
  jurisdictions;
- patent and export-control concerns have been reviewed.

Until that review is complete, treat this NOTICE as a starting point,
not a binding legal opinion.
