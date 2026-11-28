// Fail-closed plugin-config reader for the egress extensions.
//
// Every egress plugin turns its `plugins.entries.<id>.config` object into
// typed stage options through this reader. A value that is the wrong type,
// out of range, or an unknown key throws at load, so the plugin loader
// refuses the plugin (`failed during register`) instead of running a stage
// that is silently weaker than the operator configured. An omitted key keeps
// the built-in default.

type NumberBounds = {
  /** Inclusive lower bound. */
  min?: number;
  /** Exclusive lower bound. */
  above?: number;
  /** Inclusive upper bound. */
  max?: number;
  /** Exclusive upper bound. */
  below?: number;
  /** Require an integer. */
  integer?: boolean;
};

export type PluginConfigReader = {
  /** A boolean option, or `fallback` when omitted. */
  bool(key: string, fallback: boolean): boolean;
  /** A finite number within `bounds`, or `fallback` when omitted. */
  number(key: string, fallback: number, bounds?: NumberBounds): number;
  /** A finite number within `bounds`, or undefined when omitted. */
  optionalNumber(key: string, bounds?: NumberBounds): number | undefined;
  /** One of `values`, or `fallback` when omitted. */
  oneOf<T extends string>(key: string, values: readonly T[], fallback: T): T;
  /** A non-empty string (trimmed), or undefined when omitted. */
  optionalString(key: string): string | undefined;
  /** A list of non-empty strings, or `fallback` when omitted. */
  stringList(key: string, fallback: readonly string[]): readonly string[];
  /**
   * A nested object option, read with the same fail-closed rules: unknown
   * keys and wrong types inside it are refused. Omitted reads as empty.
   */
  section(key: string, knownKeys: readonly string[]): PluginConfigReader;
  /**
   * A map option (free keys, object values): each entry is returned as its
   * own reader over `knownKeys`. Omitted reads as an empty list.
   */
  entries(key: string, knownKeys: readonly string[]): Array<[string, PluginConfigReader]>;
  /** Whether the key is present (not undefined). */
  has(key: string): boolean;
  /** Throw a config error with the plugin id prefixed. */
  fail(message: string): never;
};

function describeBounds(bounds: NumberBounds): string {
  const parts: string[] = [];
  if (bounds.integer) {
    parts.push("an integer");
  } else {
    parts.push("a number");
  }
  if (bounds.min !== undefined) {
    parts.push(`>= ${bounds.min}`);
  }
  if (bounds.above !== undefined) {
    parts.push(`> ${bounds.above}`);
  }
  if (bounds.max !== undefined) {
    parts.push(`<= ${bounds.max}`);
  }
  if (bounds.below !== undefined) {
    parts.push(`< ${bounds.below}`);
  }
  return parts.join(" ");
}

function withinBounds(value: number, bounds: NumberBounds): boolean {
  if (!Number.isFinite(value)) {
    return false;
  }
  if (bounds.integer && !Number.isInteger(value)) {
    return false;
  }
  if (bounds.min !== undefined && value < bounds.min) {
    return false;
  }
  if (bounds.above !== undefined && value <= bounds.above) {
    return false;
  }
  if (bounds.max !== undefined && value > bounds.max) {
    return false;
  }
  if (bounds.below !== undefined && value >= bounds.below) {
    return false;
  }
  return true;
}

/**
 * Build a reader over a plugin's raw config. `knownKeys` lists every key the
 * plugin's manifest schema declares; any other key is refused, mirroring the
 * schema's `additionalProperties: false` for hosts that skip schema checks.
 */
export function createPluginConfigReader(
  pluginId: string,
  raw: unknown,
  knownKeys: readonly string[],
): PluginConfigReader {
  return createReader(pluginId, "", raw, knownKeys);
}

function createReader(
  pluginId: string,
  prefix: string,
  raw: unknown,
  knownKeys: readonly string[],
): PluginConfigReader {
  const fail = (message: string): never => {
    throw new Error(`${pluginId}: invalid config: ${message}`);
  };
  const where = prefix ? prefix.slice(0, -1) : "config";
  if (raw !== undefined && raw !== null && (typeof raw !== "object" || Array.isArray(raw))) {
    fail(`${where} must be an object`);
  }
  const config = (raw ?? {}) as Record<string, unknown>;
  const known = new Set(knownKeys);
  const unknown = Object.keys(config)
    .filter((key) => !known.has(key))
    .map((key) => `${prefix}${key}`)
    .toSorted();
  if (unknown.length > 0) {
    fail(`unknown option(s): ${unknown.join(", ")}`);
  }
  const name = (key: string) => `${prefix}${key}`;

  const readNumber = (key: string, bounds: NumberBounds): number | undefined => {
    const value = config[key];
    if (value === undefined) {
      return undefined;
    }
    if (typeof value !== "number" || !withinBounds(value, bounds)) {
      fail(`${name(key)} must be ${describeBounds(bounds)}`);
    }
    return value as number;
  };

  return {
    bool(key, fallback) {
      const value = config[key];
      if (value === undefined) {
        return fallback;
      }
      if (typeof value !== "boolean") {
        fail(`${name(key)} must be a boolean`);
      }
      return value as boolean;
    },
    number(key, fallback, bounds = {}) {
      return readNumber(key, bounds) ?? fallback;
    },
    optionalNumber(key, bounds = {}) {
      return readNumber(key, bounds);
    },
    oneOf(key, values, fallback) {
      const value = config[key];
      if (value === undefined) {
        return fallback;
      }
      if (typeof value !== "string" || !(values as readonly string[]).includes(value)) {
        fail(`${name(key)} must be one of ${values.join(", ")}`);
      }
      return value as (typeof values)[number];
    },
    optionalString(key) {
      const value = config[key];
      if (value === undefined) {
        return undefined;
      }
      if (typeof value !== "string" || !value.trim()) {
        fail(`${name(key)} must be a non-empty string`);
      }
      return (value as string).trim();
    },
    stringList(key, fallback) {
      const value = config[key];
      if (value === undefined) {
        return fallback;
      }
      if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
        fail(`${name(key)} must be a list of non-empty strings`);
      }
      return (value as string[]).map((item) => item.trim());
    },
    section(key, sectionKeys) {
      return createReader(pluginId, `${name(key)}.`, config[key], sectionKeys);
    },
    entries(key, entryKeys) {
      const value = config[key];
      if (value === undefined) {
        return [];
      }
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        fail(`${name(key)} must be an object`);
      }
      return Object.entries(value as Record<string, unknown>).map(([entry, entryRaw]) => {
        if (entryRaw === null || entryRaw === undefined) {
          fail(`${name(key)}.${entry} must be an object`);
        }
        return [entry, createReader(pluginId, `${name(key)}.${entry}.`, entryRaw, entryKeys)];
      });
    },
    has(key) {
      return config[key] !== undefined;
    },
    fail,
  };
}
