# In-vivo F1--F4 statistical run

Generated: 2026-05-03T02:37:18.185Z.
Samples per (channel, F-category, label): 100
Persistent audit log: `/home/metere1/.enclawed-invivo-crossllm/ol-gemma2-9b/audit.jsonl`
Persistent witness journal: `/home/metere1/.enclawed-invivo-crossllm/ol-gemma2-9b/witness.jsonl`
Per-sample CSV: `/home/metere1/enclawed-oss/docs/adversarial-in-vivo-samples-ol-gemma2-9b.csv.gz`

## Runtime fingerprint

| Property | Value |
|---|---|
| Node version | `v22.11.0` |
| Operating system | `Linux 5.15.167.4-microsoft-standard-WSL2 x64` |
| CPU model | `Intel(R) Core(TM) i9-14900K` |
| CPU count (logical) | 4 |
| Total RAM | 62.8 GB |
| Git commit | `37668a47ddf297808655ea480a5d57b71af137ba` |
| PRNG seed | `(unseeded; use ENCLAWED_INVIVO_SEED for byte-for-byte replay)` |
| Run started at | 2026-05-03T02:32:41.035Z |

## Channel: discord

### Enclawed

| F-category | TP | FP | TN | FN | precision (95% Wilson CI) | recall (95% Wilson CI) | FPR (95% Wilson CI) | F1 | accuracy |
|---|---|---|---|---|---|---|---|---|---|
| F1_BYPASS | 0 | 0 | 100 | 100 | – | 0.000 [0.000, 0.037] | 0.0000 [0, 0.0370] | – | 0.500 |
| F2_FORGE | 0 | 0 | 100 | 100 | – | 0.000 [0.000, 0.037] | 0.0000 [0, 0.0370] | – | 0.500 |
| F3_SILENT | 0 | 0 | 100 | 100 | – | 0.000 [0.000, 0.037] | 0.0000 [0, 0.0370] | – | 0.500 |
| F4_WRONGTGT | 0 | 0 | 100 | 100 | – | 0.000 [0.000, 0.037] | 0.0000 [0, 0.0370] | – | 0.500 |

### enclawed-oss

| F-category | TP | FP | TN | FN | precision (95% Wilson CI) | recall (95% Wilson CI) | FPR (95% Wilson CI) | F1 | accuracy |
|---|---|---|---|---|---|---|---|---|---|
| F1_BYPASS | 100 | 0 | 100 | 0 | 1.000 [0.963, 1.000] | 1.000 [0.963, 1.000] | 0.0000 [0, 0.0370] | 1.000 | 1.000 |
| F2_FORGE | 100 | 1 | 99 | 0 | 0.990 [0.946, 0.998] | 1.000 [0.963, 1.000] | 0.0100 [0, 0.0545] | 0.995 | 0.995 |
| F3_SILENT | 94 | 0 | 100 | 6 | 1.000 [0.961, 1.000] | 0.940 [0.875, 0.972] | 0.0000 [0, 0.0370] | 0.969 | 0.970 |
| F4_WRONGTGT | 100 | 0 | 100 | 0 | 1.000 [0.963, 1.000] | 1.000 [0.963, 1.000] | 0.0000 [0, 0.0370] | 1.000 | 1.000 |

### enclawed-enclaved (content gate only)

| F-category | TP | FP | TN | FN | precision (95% Wilson CI) | recall (95% Wilson CI) | FPR (95% Wilson CI) | F1 | accuracy |
|---|---|---|---|---|---|---|---|---|---|
| F1_BYPASS | 100 | 0 | 100 | 0 | 1.000 [0.963, 1.000] | 1.000 [0.963, 1.000] | 0.0000 [0, 0.0370] | 1.000 | 1.000 |
| F2_FORGE | 100 | 1 | 99 | 0 | 0.990 [0.946, 0.998] | 1.000 [0.963, 1.000] | 0.0100 [0, 0.0545] | 0.995 | 0.995 |
| F3_SILENT | 94 | 0 | 100 | 6 | 1.000 [0.961, 1.000] | 0.940 [0.875, 0.972] | 0.0000 [0, 0.0370] | 0.969 | 0.970 |
| F4_WRONGTGT | 100 | 0 | 100 | 0 | 1.000 [0.963, 1.000] | 1.000 [0.963, 1.000] | 0.0000 [0, 0.0370] | 1.000 | 1.000 |

### enclawed-enclaved (full stack: content + behavioral)

| F-category | TP | FP | TN | FN | precision (95% Wilson CI) | recall (95% Wilson CI) | FPR (95% Wilson CI) | F1 | accuracy |
|---|---|---|---|---|---|---|---|---|---|
| F1_BYPASS | 100 | 0 | 100 | 0 | 1.000 [0.963, 1.000] | 1.000 [0.963, 1.000] | 0.0000 [0, 0.0370] | 1.000 | 1.000 |
| F2_FORGE | 100 | 1 | 99 | 0 | 0.990 [0.946, 0.998] | 1.000 [0.963, 1.000] | 0.0100 [0, 0.0545] | 0.995 | 0.995 |
| F3_SILENT | 94 | 0 | 100 | 6 | 1.000 [0.961, 1.000] | 0.940 [0.875, 0.972] | 0.0000 [0, 0.0370] | 0.969 | 0.970 |
| F4_WRONGTGT | 100 | 0 | 100 | 0 | 1.000 [0.963, 1.000] | 1.000 [0.963, 1.000] | 0.0000 [0, 0.0370] | 1.000 | 1.000 |

### Paired comparison: McNemar's test (continuity-corrected)

Two subjects scoring the SAME samples is a paired binary outcome; McNemar is the right test. We report the disagreement counts $b$ (subject A blocked, B delivered) and $c$ (A delivered, B blocked), the chi-squared statistic, and the conventional thresholds (chi^2 >= 10.83 implies p < 0.001 at df=1).

| Comparison | $b$ | $c$ | $\chi^2$ | df | $p$ |
|---|---|---|---|---|---|
| Enclawed vs enclawed-oss | 0 | 395 | 393.00 | 1 | < 0.001 |
| Enclawed vs enclawed-enclaved (content) | 0 | 395 | 393.00 | 1 | < 0.001 |
| Enclawed vs enclawed-enclaved (full) | 0 | 395 | 393.00 | 1 | < 0.001 |
| enclawed-oss vs enclawed-enclaved (content) | 0 | 0 | 0.00 | 1 | n.s. |
| enclawed-oss vs enclawed-enclaved (full) | 0 | 0 | 0.00 | 1 | n.s. |

### enclawed-oss top block reasons

- `content: prompt-shield findings`: 313
- `content: DLP findings (severity=medium)`: 40
- `content: DLP findings (severity=high)`: 35
- `biconditional: f2Forgery on 1 (cap,target) projection(s)`: 6
- `content: DLP findings (severity=low)`: 1

### enclawed-enclaved top block reasons

- `content: prompt-shield findings`: 313
- `content: DLP findings (severity=medium)`: 40
- `content: DLP findings (severity=high)`: 35
- `biconditional: f2Forgery on 1 (cap,target) projection(s)`: 6
- `content: DLP findings (severity=low)`: 1

Total wall-clock: 277.1 s.
