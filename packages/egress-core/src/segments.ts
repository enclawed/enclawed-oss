// Per-segment rewriting for payloads that join several independent segments
// (see `EgressStageContext.segmentBoundary`). A rewriting stage maps its
// transform over the segments so it behaves exactly as if each segment were
// mediated on its own, and the boundary markers pass through untouched.

import type { EgressStageContext } from "./types.js";

type SegmentContext = Pick<EgressStageContext, "segmentBoundary">;

/** Apply `fn` to each segment of `content` (or to the whole of it when unsegmented). */
export function mapSegments(
  content: string,
  ctx: SegmentContext,
  fn: (segment: string) => string,
): string {
  const boundary = ctx.segmentBoundary;
  if (!boundary || !content.includes(boundary)) {
    return fn(content);
  }
  return content
    .split(boundary)
    .map((segment) => fn(segment))
    .join(boundary);
}

/** Async `mapSegments`; segments are processed one at a time, in order. */
export async function mapSegmentsAsync(
  content: string,
  ctx: SegmentContext,
  fn: (segment: string) => Promise<string>,
): Promise<string> {
  const boundary = ctx.segmentBoundary;
  if (!boundary || !content.includes(boundary)) {
    return await fn(content);
  }
  const out: string[] = [];
  for (const segment of content.split(boundary)) {
    out.push(await fn(segment));
  }
  return out.join(boundary);
}
