// Lazy boundary for the `media_sending` hook in outbound delivery: media
// loading, the agent-scoped media roots and the outbound media store are only
// needed when a handler is registered and a send carries attachments.
export { getAgentScopedMediaLocalRoots } from "../../media/local-roots.js";
export { saveMediaBuffer } from "../../media/store.js";
export { loadWebMediaRaw } from "../../media/web-media.js";
