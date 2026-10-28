// Walltime formats used by the supported schedulers, all converted to minutes.
// null means the value did not parse; Infinity means an explicit "no limit".

/** Slurm: M, M:S, H:M:S, D-H, D-H:M, D-H:M:S, or UNLIMITED/INFINITE. */
export function slurmMinutes(value: string): number | null {
  const v = value.trim();
  if (/^(unlimited|infinite)$/i.test(v)) {
    return Number.POSITIVE_INFINITY;
  }
  let days = 0;
  let rest = v;
  const dash = /^(\d+)-(.+)$/.exec(v);
  if (dash) {
    days = Number(dash[1]);
    rest = dash[2];
  }
  if (!/^\d+(:\d+){0,2}$/.test(rest)) {
    return null;
  }
  const parts = rest.split(":").map(Number);
  let minutes: number;
  if (dash) {
    // With days, the fields are hours[:minutes[:seconds]].
    const [h, m = 0, s = 0] = parts;
    minutes = h * 60 + m + s / 60;
  } else if (parts.length === 1) {
    minutes = parts[0];
  } else if (parts.length === 2) {
    minutes = parts[0] + parts[1] / 60;
  } else {
    minutes = parts[0] * 60 + parts[1] + parts[2] / 60;
  }
  return days * 1440 + minutes;
}

/** Moab and PBS walltime: [[[DD:]HH:]MM:]SS. */
export function pbsMinutes(value: string): number | null {
  const v = value.trim();
  if (!/^\d+(:\d+){0,3}$/.test(v)) {
    return null;
  }
  const parts = v.split(":").map(Number).toReversed();
  const [s = 0, m = 0, h = 0, d = 0] = parts;
  return d * 1440 + h * 60 + m + s / 60;
}

/** Flux: a bare number is minutes; otherwise Flux standard duration (30s, 10m, 2h, 1d). */
export function fluxMinutes(value: string): number | null {
  const m = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)?$/.exec(value.trim());
  if (!m) {
    return /^(inf|infinity)$/i.test(value.trim()) ? Number.POSITIVE_INFINITY : null;
  }
  const n = Number(m[1]);
  switch (m[2]) {
    case undefined:
    case "m":
      return n;
    case "ms":
      return n / 60_000;
    case "s":
      return n / 60;
    case "h":
      return n * 60;
    case "d":
      return n * 1440;
    default:
      return null;
  }
}
