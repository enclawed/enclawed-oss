// Adversarial mutual-information benchmark for the covert/side-channel egress
// suite. Regenerates every table of the covert-channel egress paper from the
// open code and prints each beside the published figure.
//
//   pnpm bench:covert            human-readable tables + paper diff
//   pnpm bench:covert --json     machine-readable results on stdout
//
// Every number is a measurement: working encoders, the shipped stages behind
// the real egress mediator, and receiver-side decoders. Nothing is simulated
// except wall-clock delay (the timing channel is evaluated on the monitor's
// computed release times rather than by sleeping).

import process from "node:process";
import { runAudioBenchmark, runAudioFigure } from "./audio.js";
import { CHOICE_CONFIGS, runChoiceBenchmark } from "./choice.js";
import { runCrossImage, runDesignSpace } from "./image.js";
import { runLinguisticBenchmark } from "./linguistic.js";
import {
  PAPER_AUDIO,
  PAPER_AUDIO_FIGURE,
  PAPER_DESIGN_SPACE,
  PAPER_IMAGE,
  PAPER_LINGUISTIC,
  PAPER_TEXT,
  PAPER_TEXT_MEAN,
} from "./paper.js";
import { runTextBenchmark } from "./text.js";
import { runTimingBenchmark } from "./timing.js";

export async function runCovertBenchmark() {
  const text = await runTextBenchmark(20);
  return {
    text,
    linguistic: runLinguisticBenchmark(40),
    designSpace: runDesignSpace(),
    crossImage: runCrossImage(),
    audio: runAudioBenchmark(30),
    audioFigure: runAudioFigure(),
    timing: runTimingBenchmark(20),
    choice: await runChoiceBenchmark(2000),
  };
}

export type CovertBenchmark = Awaited<ReturnType<typeof runCovertBenchmark>>;

const f1 = (n: number | null | undefined) => (n === null || n === undefined ? "--" : n.toFixed(1));
const f2 = (n: number) => n.toFixed(2);
const delta = (open: number, paper: number | null | undefined) =>
  paper === null || paper === undefined
    ? ""
    : (open - paper >= 0 ? "+" : "") + (open - paper).toFixed(1);

function table(title: string, head: string[], rows: Array<Array<string | number>>): string {
  const cells = [head, ...rows.map((r) => r.map(String))];
  const widths = head.map((_, i) => Math.max(...cells.map((r) => (r[i] ?? "").length)));
  const line = (r: string[]) => `| ${r.map((c, i) => c.padEnd(widths[i])).join(" | ")} |`;
  return [
    `\n### ${title}\n`,
    line(head),
    `| ${widths.map((w) => "-".repeat(w)).join(" | ")} |`,
    ...cells.slice(1).map(line),
  ].join("\n");
}

export function formatCovertBenchmark(r: CovertBenchmark): string {
  const out: string[] = [];
  const t = r.text;
  const rows = t.defaultRows.map((d, i) => {
    const e = t.enforceRows[i];
    const p = PAPER_TEXT[d.name];
    return [
      d.name,
      f1(d.reductionPct),
      f1(p?.default),
      f1(e.reductionPct),
      f1(p?.enforce),
      f1(d.detectedPct),
      f1(p?.detected),
      f1(e.accuracyPct),
    ];
  });
  rows.push([
    t.timing.name,
    "--",
    "--",
    f1(t.timing.reductionPct),
    f1(PAPER_TEXT[t.timing.name]?.enforce),
    "--",
    "--",
    f1(t.timing.accuracyPct),
  ]);
  const meanDefault = t.defaultRows.reduce((a, x) => a + x.reductionPct, 0) / t.defaultRows.length;
  const enforceAll = [...t.enforceRows, t.timing];
  const meanEnforce = enforceAll.reduce((a, x) => a + x.reductionPct, 0) / enforceAll.length;
  rows.push([
    "text mean",
    f1(meanDefault),
    f1(PAPER_TEXT_MEAN.default),
    f1(meanEnforce),
    f1(PAPER_TEXT_MEAN.enforce),
    "",
    "",
    "",
  ]);
  out.push(
    table(
      `Text channels at the channel chokepoint (reduction = 1 - I(X;Y), Miller-Madow; ${t.trials} trials/cell)`,
      ["channel", "default", "paper", "enforce", "paper", "detected", "paper", "enforce acc%"],
      rows,
    ),
  );

  out.push(
    table(
      "Full enforcement at every chokepoint (not in the paper)",
      ["channel", "channel send", "tool-call args", "tool result", "inbound message"],
      t.chokepoints.map((c) => [
        c.name,
        f1(c.channel),
        f1(c["tool-call"]),
        f1(c["tool-result"]),
        f1(c.inbound),
      ]),
    ),
  );

  out.push(
    table(
      "Linguistic channels through the deterministic semantic scrambler",
      [
        "channel",
        "undefended",
        "paper",
        "scrambled",
        "paper",
        "acc%",
        "paper",
        "detected",
        "idempotent",
      ],
      r.linguistic.map((l) => {
        const p = PAPER_LINGUISTIC[l.name];
        return [
          l.name,
          f1(l.undefendedReductionPct),
          f1(p?.undefended),
          f1(l.scrambledReductionPct),
          f1(p?.scrambled),
          f1(l.scrambledAccuracyPct),
          f1(p?.acc),
          f1(l.detectedPct),
          String(l.idempotent),
        ];
      }),
    ),
  );

  out.push(
    table(
      "Image LSB steganography (128x128 cover; bit-0 naive, bit-1 aware attacker)",
      [
        "defense",
        "bit-0 acc",
        "paper",
        "bit-1 acc",
        "paper",
        "bit-0 reduct.",
        "paper",
        "bit-1 reduct.",
      ],
      r.designSpace
        .filter((d) => PAPER_IMAGE[d.label])
        .map((d) => {
          const p = PAPER_IMAGE[d.label];
          return [
            d.label,
            f1(d.bit0AccPct),
            f1(p.bit0),
            f1(d.bit1AccPct),
            f1(p.bit1),
            f1(d.bit0ReductionPct),
            f1(p.reduction),
            f1(d.bit1ReductionPct),
          ];
        }),
    ),
  );

  out.push(
    table(
      "Design-space probe (master table)",
      [
        "defense",
        "bit-0",
        "paper",
        "d",
        "bit-1",
        "paper",
        "d",
        "max D",
        "paper",
        "mean D",
        "paper",
      ],
      r.designSpace.map((d) => {
        const p = PAPER_DESIGN_SPACE[d.label];
        return [
          d.label,
          f1(d.bit0AccPct),
          f1(p?.[0]),
          delta(d.bit0AccPct, p?.[0]),
          f1(d.bit1AccPct),
          f1(p?.[1]),
          delta(d.bit1AccPct, p?.[1]),
          String(d.maxDelta),
          p ? String(p[2]) : "--",
          f2(d.meanDelta),
          p ? f2(p[3]) : "--",
        ];
      }),
    ),
  );

  out.push(
    table(
      "Cross-image carriers",
      ["channel", "defense", "bound (bits)", "measured I (bits)", "receiver acc%"],
      r.crossImage.map((c) => [
        c.channel,
        c.defense,
        f2(c.boundBits),
        f2(c.residualBits),
        f1(c.receiverAccPct),
      ]),
    ),
  );

  out.push(
    table(
      "Audio carriers",
      ["carrier", "defense", "reduction", "paper", "receiver acc%", "paper"],
      r.audio.map((a) => {
        const p = PAPER_AUDIO[`${a.carrier}|${a.defense}`];
        return [
          a.carrier,
          a.defense,
          f1(a.reductionPct),
          f1(p?.reduction),
          f1(a.receiverAccPct),
          f1(p?.acc),
        ];
      }),
    ),
  );

  const af = r.audioFigure;
  out.push(
    table(
      "Audio spectral figure (8192-sample clip)",
      ["quantity", "open code", "paper"],
      [
        ["out-of-band bins zeroed", af.outOfBandBinsZeroed, PAPER_AUDIO_FIGURE.outOfBandBinsZeroed],
        [
          "sub-perceptual bins zeroed",
          af.subPerceptualBinsZeroed,
          PAPER_AUDIO_FIGURE.subPerceptualBinsZeroed,
        ],
        ...af.components.map((c) => [
          `${c.name} level (dB re clean peak)`,
          `${f1(c.beforeDb)} -> ${f1(c.afterDb)}`,
          "",
        ]),
      ],
    ),
  );

  out.push(
    table(
      "Timing side channel",
      ["defense", "reduction", "receiver acc%"],
      r.timing.map((x) => [x.defense, f1(x.reductionPct), f1(x.receiverAccPct)]),
    ),
  );

  const c = r.choice;
  out.push(
    table(
      `Choice channels through the action batcher (k=${c.k} actions from N=${c.n} allowed URLs; decoded bits = sum of per-bit I(X;Y), Miller-Madow; ${c.trials} trials/cell; not in the paper)`,
      ["encoding", "capacity", ...CHOICE_CONFIGS.map((x) => x.label)],
      [
        ...c.rows.map((row) => [
          row.encoding,
          f2(row.capacityBits),
          ...CHOICE_CONFIGS.map((x) => f2(row.decoded[x.label])),
        ]),
        ["best encoding", "", ...CHOICE_CONFIGS.map((x) => f2(c.best[x.label]))],
      ],
    ),
  );

  out.push(
    "\nNot reproduced here: the paper's boot-time media-legitimacy attestation table. " +
      "That attestation is not part of the open code; the open media scramblers treat " +
      "every payload as suspect unless a host installs a media-exemption check.",
  );
  return out.join("\n");
}

async function main() {
  const results = await runCovertBenchmark();
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    return;
  }
  process.stdout.write(`# Covert-channel egress benchmark\n${formatCovertBenchmark(results)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
