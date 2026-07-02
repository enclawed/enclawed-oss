# In-vivo F1--F4 statistical run

Generated: 2026-05-02T09:52:34.702Z.
Samples per (channel, F-category, label): 10000
Persistent audit log: `/home/metere1/.enclawed-invivo/audit.jsonl`
Persistent witness journal: `/home/metere1/.enclawed-invivo/witness.jsonl`
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
| PRNG seed | `neurips-headline-2026` |
| Run started at | 2026-05-02T09:37:07.783Z |

## Channel: discord

### Enclawed

| F-category | TP | FP | TN | FN | precision (95% Wilson CI) | recall (95% Wilson CI) | FPR (95% Wilson CI) | F1 | accuracy |
|---|---|---|---|---|---|---|---|---|---|
| F1_BYPASS | 0 | 0 | 10000 | 10000 | – | 0.000 [0.000, 0.000] | 0.0000 [0, 3.84e-4] | – | 0.500 |
| F2_FORGE | 0 | 0 | 10000 | 10000 | – | 0.000 [0.000, 0.000] | 0.0000 [0, 3.84e-4] | – | 0.500 |
| F3_SILENT | 0 | 0 | 10000 | 10000 | – | 0.000 [0.000, 0.000] | 0.0000 [0, 3.84e-4] | – | 0.500 |
| F4_WRONGTGT | 0 | 0 | 10000 | 10000 | – | 0.000 [0.000, 0.000] | 0.0000 [0, 3.84e-4] | – | 0.500 |

### enclawed-oss

| F-category | TP | FP | TN | FN | precision (95% Wilson CI) | recall (95% Wilson CI) | FPR (95% Wilson CI) | F1 | accuracy |
|---|---|---|---|---|---|---|---|---|---|
| F1_BYPASS | 10000 | 0 | 10000 | 0 | 1.000 [1.000, 1.000] | 1.000 [1.000, 1.000] | 0.0000 [0, 3.84e-4] | 1.000 | 1.000 |
| F2_FORGE | 10000 | 0 | 10000 | 0 | 1.000 [1.000, 1.000] | 1.000 [1.000, 1.000] | 0.0000 [0, 3.84e-4] | 1.000 | 1.000 |
| F3_SILENT | 10000 | 0 | 10000 | 0 | 1.000 [1.000, 1.000] | 1.000 [1.000, 1.000] | 0.0000 [0, 3.84e-4] | 1.000 | 1.000 |
| F4_WRONGTGT | 10000 | 0 | 10000 | 0 | 1.000 [1.000, 1.000] | 1.000 [1.000, 1.000] | 0.0000 [0, 3.84e-4] | 1.000 | 1.000 |

### enclawed-enclaved (content gate only)

| F-category | TP | FP | TN | FN | precision (95% Wilson CI) | recall (95% Wilson CI) | FPR (95% Wilson CI) | F1 | accuracy |
|---|---|---|---|---|---|---|---|---|---|
| F1_BYPASS | 10000 | 0 | 10000 | 0 | 1.000 [1.000, 1.000] | 1.000 [1.000, 1.000] | 0.0000 [0, 3.84e-4] | 1.000 | 1.000 |
| F2_FORGE | 10000 | 0 | 10000 | 0 | 1.000 [1.000, 1.000] | 1.000 [1.000, 1.000] | 0.0000 [0, 3.84e-4] | 1.000 | 1.000 |
| F3_SILENT | 10000 | 0 | 10000 | 0 | 1.000 [1.000, 1.000] | 1.000 [1.000, 1.000] | 0.0000 [0, 3.84e-4] | 1.000 | 1.000 |
| F4_WRONGTGT | 10000 | 0 | 10000 | 0 | 1.000 [1.000, 1.000] | 1.000 [1.000, 1.000] | 0.0000 [0, 3.84e-4] | 1.000 | 1.000 |

### enclawed-enclaved (full stack: content + behavioral)

| F-category | TP | FP | TN | FN | precision (95% Wilson CI) | recall (95% Wilson CI) | FPR (95% Wilson CI) | F1 | accuracy |
|---|---|---|---|---|---|---|---|---|---|
| F1_BYPASS | 10000 | 9528 | 472 | 0 | 0.512 [0.505, 0.519] | 1.000 [1.000, 1.000] | 0.9528 [0, 0.9568] | 0.677 | 0.524 |
| F2_FORGE | 10000 | 10000 | 0 | 0 | 0.500 [0.493, 0.507] | 1.000 [1.000, 1.000] | 1.0000 [0, 1.0000] | 0.667 | 0.500 |
| F3_SILENT | 10000 | 9999 | 1 | 0 | 0.500 [0.493, 0.507] | 1.000 [1.000, 1.000] | 0.9999 [0, 1.0000] | 0.667 | 0.500 |
| F4_WRONGTGT | 10000 | 10000 | 0 | 0 | 0.500 [0.493, 0.507] | 1.000 [1.000, 1.000] | 1.0000 [0, 1.0000] | 0.667 | 0.500 |

### Paired comparison: McNemar's test (continuity-corrected)

Two subjects scoring the SAME samples is a paired binary outcome; McNemar is the right test. We report the disagreement counts $b$ (subject A blocked, B delivered) and $c$ (A delivered, B blocked), the chi-squared statistic, and the conventional thresholds (chi^2 >= 10.83 implies p < 0.001 at df=1).

| Comparison | $b$ | $c$ | $\chi^2$ | df | $p$ |
|---|---|---|---|---|---|
| Enclawed vs enclawed-oss | 0 | 40000 | 39998.00 | 1 | < 0.001 |
| Enclawed vs enclawed-enclaved (content) | 0 | 40000 | 39998.00 | 1 | < 0.001 |
| Enclawed vs enclawed-enclaved (full) | 0 | 79527 | 79525.00 | 1 | < 0.001 |
| enclawed-oss vs enclawed-enclaved (content) | 0 | 0 | 0.00 | 1 | n.s. |
| enclawed-oss vs enclawed-enclaved (full) | 0 | 39527 | 39525.00 | 1 | < 0.001 |

### enclawed-oss top block reasons

- `content: prompt-shield findings`: 10000
- `biconditional: f2Forgery on 1 (cap,target) projection(s)`: 10000
- `content: DLP findings (severity=high)`: 10000
- `content: DLP findings (severity=medium)`: 10000

### enclawed-enclaved top block reasons

- `secmon: policy P-014 (abnormal-api-calls, severity=medium)`: 39246
- `content: prompt-shield findings`: 10000
- `biconditional: f2Forgery on 1 (cap,target) projection(s)`: 10000
- `content: DLP findings (severity=high)`: 10000
- `content: DLP findings (severity=medium)`: 10000
- `secmon: policy P-005 (unauthorized-access, severity=medium)`: 281

## Channel: telegram

### Enclawed

| F-category | TP | FP | TN | FN | precision (95% Wilson CI) | recall (95% Wilson CI) | FPR (95% Wilson CI) | F1 | accuracy |
|---|---|---|---|---|---|---|---|---|---|
| F1_BYPASS | 0 | 0 | 10000 | 10000 | – | 0.000 [0.000, 0.000] | 0.0000 [0, 3.84e-4] | – | 0.500 |
| F2_FORGE | 0 | 0 | 10000 | 10000 | – | 0.000 [0.000, 0.000] | 0.0000 [0, 3.84e-4] | – | 0.500 |
| F3_SILENT | 0 | 0 | 10000 | 10000 | – | 0.000 [0.000, 0.000] | 0.0000 [0, 3.84e-4] | – | 0.500 |
| F4_WRONGTGT | 0 | 0 | 10000 | 10000 | – | 0.000 [0.000, 0.000] | 0.0000 [0, 3.84e-4] | – | 0.500 |

### enclawed-oss

| F-category | TP | FP | TN | FN | precision (95% Wilson CI) | recall (95% Wilson CI) | FPR (95% Wilson CI) | F1 | accuracy |
|---|---|---|---|---|---|---|---|---|---|
| F1_BYPASS | 10000 | 0 | 10000 | 0 | 1.000 [1.000, 1.000] | 1.000 [1.000, 1.000] | 0.0000 [0, 3.84e-4] | 1.000 | 1.000 |
| F2_FORGE | 10000 | 0 | 10000 | 0 | 1.000 [1.000, 1.000] | 1.000 [1.000, 1.000] | 0.0000 [0, 3.84e-4] | 1.000 | 1.000 |
| F3_SILENT | 10000 | 0 | 10000 | 0 | 1.000 [1.000, 1.000] | 1.000 [1.000, 1.000] | 0.0000 [0, 3.84e-4] | 1.000 | 1.000 |
| F4_WRONGTGT | 10000 | 0 | 10000 | 0 | 1.000 [1.000, 1.000] | 1.000 [1.000, 1.000] | 0.0000 [0, 3.84e-4] | 1.000 | 1.000 |

### enclawed-enclaved (content gate only)

| F-category | TP | FP | TN | FN | precision (95% Wilson CI) | recall (95% Wilson CI) | FPR (95% Wilson CI) | F1 | accuracy |
|---|---|---|---|---|---|---|---|---|---|
| F1_BYPASS | 10000 | 0 | 10000 | 0 | 1.000 [1.000, 1.000] | 1.000 [1.000, 1.000] | 0.0000 [0, 3.84e-4] | 1.000 | 1.000 |
| F2_FORGE | 10000 | 0 | 10000 | 0 | 1.000 [1.000, 1.000] | 1.000 [1.000, 1.000] | 0.0000 [0, 3.84e-4] | 1.000 | 1.000 |
| F3_SILENT | 10000 | 0 | 10000 | 0 | 1.000 [1.000, 1.000] | 1.000 [1.000, 1.000] | 0.0000 [0, 3.84e-4] | 1.000 | 1.000 |
| F4_WRONGTGT | 10000 | 0 | 10000 | 0 | 1.000 [1.000, 1.000] | 1.000 [1.000, 1.000] | 0.0000 [0, 3.84e-4] | 1.000 | 1.000 |

### enclawed-enclaved (full stack: content + behavioral)

| F-category | TP | FP | TN | FN | precision (95% Wilson CI) | recall (95% Wilson CI) | FPR (95% Wilson CI) | F1 | accuracy |
|---|---|---|---|---|---|---|---|---|---|
| F1_BYPASS | 10000 | 10000 | 0 | 0 | 0.500 [0.493, 0.507] | 1.000 [1.000, 1.000] | 1.0000 [0, 1.0000] | 0.667 | 0.500 |
| F2_FORGE | 10000 | 8472 | 1528 | 0 | 0.541 [0.534, 0.549] | 1.000 [1.000, 1.000] | 0.8472 [0, 0.8541] | 0.702 | 0.576 |
| F3_SILENT | 10000 | 9315 | 685 | 0 | 0.518 [0.511, 0.525] | 1.000 [1.000, 1.000] | 0.9315 [0, 0.9363] | 0.682 | 0.534 |
| F4_WRONGTGT | 10000 | 10000 | 0 | 0 | 0.500 [0.493, 0.507] | 1.000 [1.000, 1.000] | 1.0000 [0, 1.0000] | 0.667 | 0.500 |

### Paired comparison: McNemar's test (continuity-corrected)

Two subjects scoring the SAME samples is a paired binary outcome; McNemar is the right test. We report the disagreement counts $b$ (subject A blocked, B delivered) and $c$ (A delivered, B blocked), the chi-squared statistic, and the conventional thresholds (chi^2 >= 10.83 implies p < 0.001 at df=1).

| Comparison | $b$ | $c$ | $\chi^2$ | df | $p$ |
|---|---|---|---|---|---|
| Enclawed vs enclawed-oss | 0 | 40000 | 39998.00 | 1 | < 0.001 |
| Enclawed vs enclawed-enclaved (content) | 0 | 40000 | 39998.00 | 1 | < 0.001 |
| Enclawed vs enclawed-enclaved (full) | 0 | 77787 | 77785.00 | 1 | < 0.001 |
| enclawed-oss vs enclawed-enclaved (content) | 0 | 0 | 0.00 | 1 | n.s. |
| enclawed-oss vs enclawed-enclaved (full) | 0 | 37787 | 37785.00 | 1 | < 0.001 |

### enclawed-oss top block reasons

- `content: prompt-shield findings`: 10000
- `biconditional: f2Forgery on 1 (cap,target) projection(s)`: 10000
- `content: DLP findings (severity=high)`: 10000
- `content: DLP findings (severity=medium)`: 10000

### enclawed-enclaved top block reasons

- `secmon: policy P-014 (abnormal-api-calls, severity=medium)`: 34366
- `content: prompt-shield findings`: 10000
- `biconditional: f2Forgery on 1 (cap,target) projection(s)`: 10000
- `content: DLP findings (severity=high)`: 10000
- `content: DLP findings (severity=medium)`: 10000
- `secmon: policy P-005 (unauthorized-access, severity=medium)`: 3421

Total wall-clock: 926.9 s.
