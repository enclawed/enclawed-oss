// NOTE: "tokenjuice/openclaw" is the upstream `tokenjuice` npm package's
// subpath export; the upstream export name (createTokenjuiceOpenClawEmbeddedExtension)
// cannot be renamed. We re-export it locally under the new enclawed name.
export { createTokenjuiceOpenClawEmbeddedExtension as createTokenjuiceEnclawedEmbeddedExtension } from "tokenjuice/openclaw";
