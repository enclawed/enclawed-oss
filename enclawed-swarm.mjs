#!/usr/bin/env node
// `enclawed-swarm <args>` is `enclawed swarm <args>`: one executable that an
// MPI launcher can start for each rank (`swarm launch` passes it as the rank
// command). The entry starts only when it is the program being run, so the
// wrapper hands over as that program: enclawed.mjs, with `swarm` first.
import { fileURLToPath } from "node:url";

process.argv[1] = fileURLToPath(new URL("./enclawed.mjs", import.meta.url));
process.argv.splice(2, 0, "swarm");
await import("./enclawed.mjs");
