# In-vivo F1--F4 statistical run

Generated: 2026-05-03T03:17:24.874Z.
Samples per (channel, F-category, label): 5
Persistent audit log: `/tmp/smoke-real-oc/audit.jsonl`
Persistent witness journal: `/tmp/smoke-real-oc/witness.jsonl`
Per-sample CSV: `/home/metere1/enclawed-oss/docs/adversarial-in-vivo-samples-smoke-real-oc.csv.gz`

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
| Run started at | 2026-05-03T03:17:24.088Z |

## Channel: discord

### Enclawed

| F-category | TP | FP | TN | FN | precision (95% Wilson CI) | recall (95% Wilson CI) | FPR (95% Wilson CI) | F1 | accuracy |
|---|---|---|---|---|---|---|---|---|---|
| F1_BYPASS | 0 | 0 | 5 | 5 | – | 0.000 [0.000, 0.434] | 0.0000 [0, 0.4345] | – | 0.500 |
| F2_FORGE | 0 | 0 | 5 | 5 | – | 0.000 [0.000, 0.434] | 0.0000 [0, 0.4345] | – | 0.500 |
| F3_SILENT | 0 | 0 | 5 | 5 | – | 0.000 [0.000, 0.434] | 0.0000 [0, 0.4345] | – | 0.500 |
| F4_WRONGTGT | 0 | 0 | 5 | 5 | – | 0.000 [0.000, 0.434] | 0.0000 [0, 0.4345] | – | 0.500 |

### enclawed-oss

| F-category | TP | FP | TN | FN | precision (95% Wilson CI) | recall (95% Wilson CI) | FPR (95% Wilson CI) | F1 | accuracy |
|---|---|---|---|---|---|---|---|---|---|
| F1_BYPASS | 5 | 0 | 5 | 0 | 1.000 [0.566, 1.000] | 1.000 [0.566, 1.000] | 0.0000 [0, 0.4345] | 1.000 | 1.000 |
| F2_FORGE | 5 | 0 | 5 | 0 | 1.000 [0.566, 1.000] | 1.000 [0.566, 1.000] | 0.0000 [0, 0.4345] | 1.000 | 1.000 |
| F3_SILENT | 5 | 0 | 5 | 0 | 1.000 [0.566, 1.000] | 1.000 [0.566, 1.000] | 0.0000 [0, 0.4345] | 1.000 | 1.000 |
| F4_WRONGTGT | 5 | 0 | 5 | 0 | 1.000 [0.566, 1.000] | 1.000 [0.566, 1.000] | 0.0000 [0, 0.4345] | 1.000 | 1.000 |

### enclawed-enclaved (content gate only)

| F-category | TP | FP | TN | FN | precision (95% Wilson CI) | recall (95% Wilson CI) | FPR (95% Wilson CI) | F1 | accuracy |
|---|---|---|---|---|---|---|---|---|---|
| F1_BYPASS | 5 | 0 | 5 | 0 | 1.000 [0.566, 1.000] | 1.000 [0.566, 1.000] | 0.0000 [0, 0.4345] | 1.000 | 1.000 |
| F2_FORGE | 5 | 0 | 5 | 0 | 1.000 [0.566, 1.000] | 1.000 [0.566, 1.000] | 0.0000 [0, 0.4345] | 1.000 | 1.000 |
| F3_SILENT | 5 | 0 | 5 | 0 | 1.000 [0.566, 1.000] | 1.000 [0.566, 1.000] | 0.0000 [0, 0.4345] | 1.000 | 1.000 |
| F4_WRONGTGT | 5 | 0 | 5 | 0 | 1.000 [0.566, 1.000] | 1.000 [0.566, 1.000] | 0.0000 [0, 0.4345] | 1.000 | 1.000 |

### enclawed-enclaved (full stack: content + behavioral)

| F-category | TP | FP | TN | FN | precision (95% Wilson CI) | recall (95% Wilson CI) | FPR (95% Wilson CI) | F1 | accuracy |
|---|---|---|---|---|---|---|---|---|---|
| F1_BYPASS | 5 | 0 | 5 | 0 | 1.000 [0.566, 1.000] | 1.000 [0.566, 1.000] | 0.0000 [0, 0.4345] | 1.000 | 1.000 |
| F2_FORGE | 5 | 0 | 5 | 0 | 1.000 [0.566, 1.000] | 1.000 [0.566, 1.000] | 0.0000 [0, 0.4345] | 1.000 | 1.000 |
| F3_SILENT | 5 | 0 | 5 | 0 | 1.000 [0.566, 1.000] | 1.000 [0.566, 1.000] | 0.0000 [0, 0.4345] | 1.000 | 1.000 |
| F4_WRONGTGT | 5 | 0 | 5 | 0 | 1.000 [0.566, 1.000] | 1.000 [0.566, 1.000] | 0.0000 [0, 0.4345] | 1.000 | 1.000 |

### Paired comparison: McNemar's test (continuity-corrected)

Two subjects scoring the SAME samples is a paired binary outcome; McNemar is the right test. We report the disagreement counts $b$ (subject A blocked, B delivered) and $c$ (A delivered, B blocked), the chi-squared statistic, and the conventional thresholds (chi^2 >= 10.83 implies p < 0.001 at df=1).

| Comparison | $b$ | $c$ | $\chi^2$ | df | $p$ |
|---|---|---|---|---|---|
| Enclawed vs enclawed-oss | 0 | 20 | 18.05 | 1 | < 0.001 |
| Enclawed vs enclawed-enclaved (content) | 0 | 20 | 18.05 | 1 | < 0.001 |
| Enclawed vs enclawed-enclaved (full) | 0 | 20 | 18.05 | 1 | < 0.001 |
| enclawed-oss vs enclawed-enclaved (content) | 0 | 0 | 0.00 | 1 | n.s. |
| enclawed-oss vs enclawed-enclaved (full) | 0 | 0 | 0.00 | 1 | n.s. |

### enclawed-oss top block reasons

- `content: prompt-shield findings`: 5
- `biconditional: f2Forgery on 1 (cap,target) projection(s)`: 5
- `content: DLP findings (severity=high)`: 5
- `content: DLP findings (severity=medium)`: 5

### enclawed-enclaved top block reasons

- `content: prompt-shield findings`: 5
- `biconditional: f2Forgery on 1 (cap,target) projection(s)`: 5
- `content: DLP findings (severity=high)`: 5
- `content: DLP findings (severity=medium)`: 5

Total wall-clock: 0.5 s.
