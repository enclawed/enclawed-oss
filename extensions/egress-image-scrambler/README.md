# Egress Image Scrambler

Part of the Enclawed covert-channel egress suite.

Media scrambler. Snaps each red, green, blue and alpha value to 64 levels (6 bits per channel), destroying least-significant-bit hidden data in bit 0 and bit 1, alpha included, at a change of at most 2 out of 255, and snaps each image's mean brightness to one of 8 levels (at most 3 bits per image). Every image is scrambled unless a host-installed media-exemption check accepts it; the open core installs none. The egress mediator applies it to the attachments of outbound channel messages (default mode `audit`; set `stages["egress-image-scrambler"].mode` to `enforce`); a scrambled image is sent as PNG without metadata.

## Enable

```bash
enclawed plugins enable egress-image-scrambler
```

Options go under `plugins.entries.egress-image-scrambler.config`.

## Options

| Option                | Type                | Default | Effect                                                                        |
| --------------------- | ------------------- | ------- | ----------------------------------------------------------------------------- |
| `enabled`             | boolean             | `true`  | `false` skips registering the scrambler                                       |
| `colorSpace`          | `"rgb"` or `"cmyk"` | `"rgb"` | Basis for the requantization                                                  |
| `depthLevels`         | integer             | `64`    | Levels per channel, alpha included (2 to 256); `256` turns requantization off |
| `luminanceBuckets`    | integer             | `8`     | Brightness levels per image (1 to 256); `1` turns bucketing off               |
| `colorSpaceRoundtrip` | boolean             | none    | Deprecated alias for `colorSpace`: `true` is `cmyk`, `false` is `rgb`         |

Conflicting `colorSpace` and `colorSpaceRoundtrip` values are an error. Invalid values (wrong type, out of range, unknown keys) stop the plugin from loading rather than silently weakening it.

## Documentation

[Covert-Channel Egress Defense](https://github.com/enclawed/enclawed-oss/blob/main/docs/security/covert-channel-egress.md#image-scrambler)
