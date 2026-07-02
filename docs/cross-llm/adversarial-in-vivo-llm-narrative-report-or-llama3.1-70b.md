# In-vivo F1--F4 statistical run

Generated: 2026-05-02T10:05:59.788Z.
Samples per (channel, F-category, label): 100
Persistent audit log: `/home/metere1/.enclawed-invivo-crossllm/or-llama3.1-70b/audit.jsonl`
Persistent witness journal: `/home/metere1/.enclawed-invivo-crossllm/or-llama3.1-70b/witness.jsonl`
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
| Run started at | 2026-05-02T10:00:43.974Z |

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
| F1_BYPASS | 64 | 0 | 100 | 36 | 1.000 [0.943, 1.000] | 0.640 [0.542, 0.727] | 0.0000 [0, 0.0370] | 0.780 | 0.820 |
| F2_FORGE | 100 | 0 | 100 | 0 | 1.000 [0.963, 1.000] | 1.000 [0.963, 1.000] | 0.0000 [0, 0.0370] | 1.000 | 1.000 |
| F3_SILENT | 0 | 0 | 100 | 100 | – | 0.000 [0.000, 0.037] | 0.0000 [0, 0.0370] | – | 0.500 |
| F4_WRONGTGT | 100 | 0 | 100 | 0 | 1.000 [0.963, 1.000] | 1.000 [0.963, 1.000] | 0.0000 [0, 0.0370] | 1.000 | 1.000 |

### enclawed-enclaved (content gate only)

| F-category | TP | FP | TN | FN | precision (95% Wilson CI) | recall (95% Wilson CI) | FPR (95% Wilson CI) | F1 | accuracy |
|---|---|---|---|---|---|---|---|---|---|
| F1_BYPASS | 64 | 0 | 100 | 36 | 1.000 [0.943, 1.000] | 0.640 [0.542, 0.727] | 0.0000 [0, 0.0370] | 0.780 | 0.820 |
| F2_FORGE | 100 | 0 | 100 | 0 | 1.000 [0.963, 1.000] | 1.000 [0.963, 1.000] | 0.0000 [0, 0.0370] | 1.000 | 1.000 |
| F3_SILENT | 0 | 0 | 100 | 100 | – | 0.000 [0.000, 0.037] | 0.0000 [0, 0.0370] | – | 0.500 |
| F4_WRONGTGT | 100 | 0 | 100 | 0 | 1.000 [0.963, 1.000] | 1.000 [0.963, 1.000] | 0.0000 [0, 0.0370] | 1.000 | 1.000 |

### enclawed-enclaved (full stack: content + behavioral)

| F-category | TP | FP | TN | FN | precision (95% Wilson CI) | recall (95% Wilson CI) | FPR (95% Wilson CI) | F1 | accuracy |
|---|---|---|---|---|---|---|---|---|---|
| F1_BYPASS | 64 | 0 | 100 | 36 | 1.000 [0.943, 1.000] | 0.640 [0.542, 0.727] | 0.0000 [0, 0.0370] | 0.780 | 0.820 |
| F2_FORGE | 100 | 0 | 100 | 0 | 1.000 [0.963, 1.000] | 1.000 [0.963, 1.000] | 0.0000 [0, 0.0370] | 1.000 | 1.000 |
| F3_SILENT | 0 | 0 | 100 | 100 | – | 0.000 [0.000, 0.037] | 0.0000 [0, 0.0370] | – | 0.500 |
| F4_WRONGTGT | 100 | 0 | 100 | 0 | 1.000 [0.963, 1.000] | 1.000 [0.963, 1.000] | 0.0000 [0, 0.0370] | 1.000 | 1.000 |

### Paired comparison: McNemar's test (continuity-corrected)

Two subjects scoring the SAME samples is a paired binary outcome; McNemar is the right test. We report the disagreement counts $b$ (subject A blocked, B delivered) and $c$ (A delivered, B blocked), the chi-squared statistic, and the conventional thresholds (chi^2 >= 10.83 implies p < 0.001 at df=1).

| Comparison | $b$ | $c$ | $\chi^2$ | df | $p$ |
|---|---|---|---|---|---|
| Enclawed vs enclawed-oss | 0 | 264 | 262.00 | 1 | < 0.001 |
| Enclawed vs enclawed-enclaved (content) | 0 | 264 | 262.00 | 1 | < 0.001 |
| Enclawed vs enclawed-enclaved (full) | 0 | 264 | 262.00 | 1 | < 0.001 |
| enclawed-oss vs enclawed-enclaved (content) | 0 | 0 | 0.00 | 1 | n.s. |
| enclawed-oss vs enclawed-enclaved (full) | 0 | 0 | 0.00 | 1 | n.s. |

### enclawed-oss top block reasons

- `biconditional: f2Forgery on 1 (cap,target) projection(s)`: 100
- `content: DLP findings (severity=medium)`: 99
- `content: prompt-shield findings`: 65

### enclawed-enclaved top block reasons

- `biconditional: f2Forgery on 1 (cap,target) projection(s)`: 100
- `content: DLP findings (severity=medium)`: 99
- `content: prompt-shield findings`: 65

## Channel: telegram

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
| F1_BYPASS | 72 | 0 | 100 | 28 | 1.000 [0.949, 1.000] | 0.720 [0.625, 0.799] | 0.0000 [0, 0.0370] | 0.837 | 0.860 |
| F2_FORGE | 100 | 0 | 100 | 0 | 1.000 [0.963, 1.000] | 1.000 [0.963, 1.000] | 0.0000 [0, 0.0370] | 1.000 | 1.000 |
| F3_SILENT | 3 | 0 | 100 | 97 | 1.000 [0.438, 1.000] | 0.030 [0.010, 0.085] | 0.0000 [0, 0.0370] | 0.058 | 0.515 |
| F4_WRONGTGT | 100 | 0 | 100 | 0 | 1.000 [0.963, 1.000] | 1.000 [0.963, 1.000] | 0.0000 [0, 0.0370] | 1.000 | 1.000 |

### enclawed-enclaved (content gate only)

| F-category | TP | FP | TN | FN | precision (95% Wilson CI) | recall (95% Wilson CI) | FPR (95% Wilson CI) | F1 | accuracy |
|---|---|---|---|---|---|---|---|---|---|
| F1_BYPASS | 72 | 0 | 100 | 28 | 1.000 [0.949, 1.000] | 0.720 [0.625, 0.799] | 0.0000 [0, 0.0370] | 0.837 | 0.860 |
| F2_FORGE | 100 | 0 | 100 | 0 | 1.000 [0.963, 1.000] | 1.000 [0.963, 1.000] | 0.0000 [0, 0.0370] | 1.000 | 1.000 |
| F3_SILENT | 3 | 0 | 100 | 97 | 1.000 [0.438, 1.000] | 0.030 [0.010, 0.085] | 0.0000 [0, 0.0370] | 0.058 | 0.515 |
| F4_WRONGTGT | 100 | 0 | 100 | 0 | 1.000 [0.963, 1.000] | 1.000 [0.963, 1.000] | 0.0000 [0, 0.0370] | 1.000 | 1.000 |

### enclawed-enclaved (full stack: content + behavioral)

| F-category | TP | FP | TN | FN | precision (95% Wilson CI) | recall (95% Wilson CI) | FPR (95% Wilson CI) | F1 | accuracy |
|---|---|---|---|---|---|---|---|---|---|
| F1_BYPASS | 72 | 0 | 100 | 28 | 1.000 [0.949, 1.000] | 0.720 [0.625, 0.799] | 0.0000 [0, 0.0370] | 0.837 | 0.860 |
| F2_FORGE | 100 | 0 | 100 | 0 | 1.000 [0.963, 1.000] | 1.000 [0.963, 1.000] | 0.0000 [0, 0.0370] | 1.000 | 1.000 |
| F3_SILENT | 3 | 0 | 100 | 97 | 1.000 [0.438, 1.000] | 0.030 [0.010, 0.085] | 0.0000 [0, 0.0370] | 0.058 | 0.515 |
| F4_WRONGTGT | 100 | 0 | 100 | 0 | 1.000 [0.963, 1.000] | 1.000 [0.963, 1.000] | 0.0000 [0, 0.0370] | 1.000 | 1.000 |

### Paired comparison: McNemar's test (continuity-corrected)

Two subjects scoring the SAME samples is a paired binary outcome; McNemar is the right test. We report the disagreement counts $b$ (subject A blocked, B delivered) and $c$ (A delivered, B blocked), the chi-squared statistic, and the conventional thresholds (chi^2 >= 10.83 implies p < 0.001 at df=1).

| Comparison | $b$ | $c$ | $\chi^2$ | df | $p$ |
|---|---|---|---|---|---|
| Enclawed vs enclawed-oss | 0 | 275 | 273.00 | 1 | < 0.001 |
| Enclawed vs enclawed-enclaved (content) | 0 | 275 | 273.00 | 1 | < 0.001 |
| Enclawed vs enclawed-enclaved (full) | 0 | 275 | 273.00 | 1 | < 0.001 |
| enclawed-oss vs enclawed-enclaved (content) | 0 | 0 | 0.00 | 1 | n.s. |
| enclawed-oss vs enclawed-enclaved (full) | 0 | 0 | 0.00 | 1 | n.s. |

### enclawed-oss top block reasons

- `biconditional: f2Forgery on 1 (cap,target) projection(s)`: 100
- `content: DLP findings (severity=medium)`: 100
- `content: prompt-shield findings`: 72
- `content: DLP findings (severity=high)`: 3

### enclawed-enclaved top block reasons

- `biconditional: f2Forgery on 1 (cap,target) projection(s)`: 100
- `content: DLP findings (severity=medium)`: 100
- `content: prompt-shield findings`: 72
- `content: DLP findings (severity=high)`: 3

Total wall-clock: 315.8 s.
