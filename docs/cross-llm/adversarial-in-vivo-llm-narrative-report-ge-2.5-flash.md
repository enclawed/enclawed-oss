# In-vivo F1--F4 statistical run

Generated: 2026-05-02T10:06:55.053Z.
Samples per (channel, F-category, label): 100
Persistent audit log: `/home/metere1/.enclawed-invivo-crossllm/ge-2.5-flash/audit.jsonl`
Persistent witness journal: `/home/metere1/.enclawed-invivo-crossllm/ge-2.5-flash/witness.jsonl`
Per-sample CSV: `/home/metere1/enclawed-enclaved/docs/adversarial-in-vivo-samples.csv.gz`

## Runtime fingerprint

| Property | Value |
|---|---|
| Node version | `v22.11.0` |
| Operating system | `Linux 5.15.167.4-microsoft-standard-WSL2 x64` |
| CPU model | `Intel(R) Core(TM) i9-14900K` |
| CPU count (logical) | 4 |
| Total RAM | 62.8 GB |
| Git commit | `e95d5aec8fafadc1743f0b2d370b462cc748a2c1` |
| PRNG seed | `(unseeded; use ENCLAWED_INVIVO_SEED for byte-for-byte replay)` |
| Run started at | 2026-05-02T10:05:59.825Z |

## Channel: discord

### Enclawed

| F-category | TP | FP | TN | FN | precision (95% Wilson CI) | recall (95% Wilson CI) | FPR (95% Wilson CI) | F1 | accuracy |
|---|---|---|---|---|---|---|---|---|---|
| F1_BYPASS | 0 | 0 | 7 | 0 | – | – | 0.0000 [0, 0.3543] | – | 1.000 |
| F2_FORGE | 0 | 0 | 0 | 0 | – | – | – | – | – |
| F3_SILENT | 0 | 0 | 0 | 0 | – | – | – | – | – |
| F4_WRONGTGT | 0 | 0 | 0 | 0 | – | – | – | – | – |

### enclawed-oss

| F-category | TP | FP | TN | FN | precision (95% Wilson CI) | recall (95% Wilson CI) | FPR (95% Wilson CI) | F1 | accuracy |
|---|---|---|---|---|---|---|---|---|---|
| F1_BYPASS | 0 | 0 | 7 | 0 | – | – | 0.0000 [0, 0.3543] | – | 1.000 |
| F2_FORGE | 0 | 0 | 0 | 0 | – | – | – | – | – |
| F3_SILENT | 0 | 0 | 0 | 0 | – | – | – | – | – |
| F4_WRONGTGT | 0 | 0 | 0 | 0 | – | – | – | – | – |

### enclawed-enclaved (content gate only)

| F-category | TP | FP | TN | FN | precision (95% Wilson CI) | recall (95% Wilson CI) | FPR (95% Wilson CI) | F1 | accuracy |
|---|---|---|---|---|---|---|---|---|---|
| F1_BYPASS | 0 | 0 | 7 | 0 | – | – | 0.0000 [0, 0.3543] | – | 1.000 |
| F2_FORGE | 0 | 0 | 0 | 0 | – | – | – | – | – |
| F3_SILENT | 0 | 0 | 0 | 0 | – | – | – | – | – |
| F4_WRONGTGT | 0 | 0 | 0 | 0 | – | – | – | – | – |

### enclawed-enclaved (full stack: content + behavioral)

| F-category | TP | FP | TN | FN | precision (95% Wilson CI) | recall (95% Wilson CI) | FPR (95% Wilson CI) | F1 | accuracy |
|---|---|---|---|---|---|---|---|---|---|
| F1_BYPASS | 0 | 0 | 7 | 0 | – | – | 0.0000 [0, 0.3543] | – | 1.000 |
| F2_FORGE | 0 | 0 | 0 | 0 | – | – | – | – | – |
| F3_SILENT | 0 | 0 | 0 | 0 | – | – | – | – | – |
| F4_WRONGTGT | 0 | 0 | 0 | 0 | – | – | – | – | – |

### Paired comparison: McNemar's test (continuity-corrected)

Two subjects scoring the SAME samples is a paired binary outcome; McNemar is the right test. We report the disagreement counts $b$ (subject A blocked, B delivered) and $c$ (A delivered, B blocked), the chi-squared statistic, and the conventional thresholds (chi^2 >= 10.83 implies p < 0.001 at df=1).

| Comparison | $b$ | $c$ | $\chi^2$ | df | $p$ |
|---|---|---|---|---|---|
| Enclawed vs enclawed-oss | 0 | 0 | 0.00 | 1 | n.s. |
| Enclawed vs enclawed-enclaved (content) | 0 | 0 | 0.00 | 1 | n.s. |
| Enclawed vs enclawed-enclaved (full) | 0 | 0 | 0.00 | 1 | n.s. |
| enclawed-oss vs enclawed-enclaved (content) | 0 | 0 | 0.00 | 1 | n.s. |
| enclawed-oss vs enclawed-enclaved (full) | 0 | 0 | 0.00 | 1 | n.s. |

### enclawed-oss top block reasons


### enclawed-enclaved top block reasons


## Channel: telegram

### Enclawed

| F-category | TP | FP | TN | FN | precision (95% Wilson CI) | recall (95% Wilson CI) | FPR (95% Wilson CI) | F1 | accuracy |
|---|---|---|---|---|---|---|---|---|---|
| F1_BYPASS | 0 | 0 | 0 | 0 | – | – | – | – | – |
| F2_FORGE | 0 | 0 | 0 | 0 | – | – | – | – | – |
| F3_SILENT | 0 | 0 | 0 | 0 | – | – | – | – | – |
| F4_WRONGTGT | 0 | 0 | 0 | 0 | – | – | – | – | – |

### enclawed-oss

| F-category | TP | FP | TN | FN | precision (95% Wilson CI) | recall (95% Wilson CI) | FPR (95% Wilson CI) | F1 | accuracy |
|---|---|---|---|---|---|---|---|---|---|
| F1_BYPASS | 0 | 0 | 0 | 0 | – | – | – | – | – |
| F2_FORGE | 0 | 0 | 0 | 0 | – | – | – | – | – |
| F3_SILENT | 0 | 0 | 0 | 0 | – | – | – | – | – |
| F4_WRONGTGT | 0 | 0 | 0 | 0 | – | – | – | – | – |

### enclawed-enclaved (content gate only)

| F-category | TP | FP | TN | FN | precision (95% Wilson CI) | recall (95% Wilson CI) | FPR (95% Wilson CI) | F1 | accuracy |
|---|---|---|---|---|---|---|---|---|---|
| F1_BYPASS | 0 | 0 | 0 | 0 | – | – | – | – | – |
| F2_FORGE | 0 | 0 | 0 | 0 | – | – | – | – | – |
| F3_SILENT | 0 | 0 | 0 | 0 | – | – | – | – | – |
| F4_WRONGTGT | 0 | 0 | 0 | 0 | – | – | – | – | – |

### enclawed-enclaved (full stack: content + behavioral)

| F-category | TP | FP | TN | FN | precision (95% Wilson CI) | recall (95% Wilson CI) | FPR (95% Wilson CI) | F1 | accuracy |
|---|---|---|---|---|---|---|---|---|---|
| F1_BYPASS | 0 | 0 | 0 | 0 | – | – | – | – | – |
| F2_FORGE | 0 | 0 | 0 | 0 | – | – | – | – | – |
| F3_SILENT | 0 | 0 | 0 | 0 | – | – | – | – | – |
| F4_WRONGTGT | 0 | 0 | 0 | 0 | – | – | – | – | – |

### Paired comparison: McNemar's test (continuity-corrected)

Two subjects scoring the SAME samples is a paired binary outcome; McNemar is the right test. We report the disagreement counts $b$ (subject A blocked, B delivered) and $c$ (A delivered, B blocked), the chi-squared statistic, and the conventional thresholds (chi^2 >= 10.83 implies p < 0.001 at df=1).

| Comparison | $b$ | $c$ | $\chi^2$ | df | $p$ |
|---|---|---|---|---|---|
| Enclawed vs enclawed-oss | 0 | 0 | 0.00 | 1 | n.s. |
| Enclawed vs enclawed-enclaved (content) | 0 | 0 | 0.00 | 1 | n.s. |
| Enclawed vs enclawed-enclaved (full) | 0 | 0 | 0.00 | 1 | n.s. |
| enclawed-oss vs enclawed-enclaved (content) | 0 | 0 | 0.00 | 1 | n.s. |
| enclawed-oss vs enclawed-enclaved (full) | 0 | 0 | 0.00 | 1 | n.s. |

### enclawed-oss top block reasons


### enclawed-enclaved top block reasons


Total wall-clock: 55.2 s.
