# Egress Audio Scrambler

Part of the Enclawed covert-channel egress suite.

Media scrambler. Takes the Fourier transform of each clip, zeroes frequencies outside the audible band and frequencies far quieter than the loudest one, and transforms back. Removes ultrasonic, subsonic, and faint narrowband hidden carriers while keeping what a person hears. Every clip is scrambled unless a host-installed media-exemption check accepts it; the open core installs none. The egress mediator applies it to WAV attachments of outbound channel messages (default mode `audit`; set `stages["egress-audio-scrambler"].mode` to `enforce`). While it enforces, audio the open codec cannot decode (MP3, Ogg, Opus) is blocked.

## Enable

```bash
enclawed plugins enable egress-audio-scrambler
```

Options go under `plugins.entries.egress-audio-scrambler.config`.

## Options

| Option              | Type    | Default                | Effect                                                                    |
| ------------------- | ------- | ---------------------- | ------------------------------------------------------------------------- |
| `enabled`           | boolean | `true`                 | `false` skips registering the scrambler                                   |
| `minHz`             | number  | `20`                   | Zero energy below this frequency; must be below `maxHz`                   |
| `maxHz`             | number  | `20000`                | Zero energy above this frequency                                          |
| `perceptualFloor`   | number  | `0.003` (about -50 dB) | Zero frequencies below this fraction of the loudest one; `0` turns it off |
| `perceptualFloorDb` | number  | none                   | The same floor in dB, for example `-50`; must be 0 or less                |

Set `perceptualFloor` or `perceptualFloorDb`, not both. Invalid values stop the plugin from loading.

## Documentation

[Covert-Channel Egress Defense](https://github.com/enclawed/enclawed-oss/blob/main/docs/security/covert-channel-egress.md#audio-scrambler)
