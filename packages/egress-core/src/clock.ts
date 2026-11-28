// The clock every egress timing decision runs on.
//
// Windows, the padding grid, refresh rounds, budget holds, ledger refills,
// rate windows and send-time quanta measure intervals, never dates. They run
// on the system-wide monotonic clock (Linux CLOCK_MONOTONIC, macOS mach time,
// Windows QueryPerformanceCounter), which a wall-clock step (NTP, a VM or WSL
// host resync, a person setting the date) does not move. On the wall clock a
// step would shift the padding grid, release a window early or late, grant a
// ledger a refill it did not earn, or reopen a rate window.

/** Milliseconds on the system-wide monotonic clock (arbitrary origin; intervals only). */
export function monotonicNow(): number {
  // Whole microseconds first: exact as a double for centuries of uptime.
  return Number(process.hrtime.bigint() / 1000n) / 1000;
}
