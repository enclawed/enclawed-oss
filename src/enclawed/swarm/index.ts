// Agent swarms across many hosts: membership, a coordinator blockchain run by
// the gateways, epoch-scoped leases and device-signed heartbeats.

export * from "./types.js";
export { canonicalJson, digest, digestHex, TAG, ZERO_HASH } from "./codec.js";
export {
  deviceSigner,
  isPrincipalKey,
  softwareSigner,
  verifyDigest,
  type KeyKind,
  type SigningDevice,
  type SwarmPrincipalKey,
  type SwarmSigner,
} from "./signer.js";
export { heartbeatDigest, signHeartbeat, verifyHeartbeat } from "./heartbeat.js";
export {
  applyBlock,
  applyCommitted,
  approvalDigest,
  blockHash,
  ChainError,
  faultTolerance,
  fileLedgerStore,
  genesisHash,
  genesisState,
  joinDigest,
  makeBlock,
  memoryLedgerStore,
  MIN_COORDINATORS,
  proposerFor,
  quorumSize,
  statementDigest,
  SwarmLedger,
  validateGenesis,
  verifyEquivocation,
  verifyQc,
  verifyStatement,
  type ChainErrorCode,
  type CommitResult,
  type ForkEvidence,
  type LedgerStore,
} from "./chain.js";
export {
  CoordinatorEngine,
  DEFAULT_TIMEOUTS,
  systemClock,
  type ConsensusClock,
  type ConsensusMessage,
  type ConsensusTimeouts,
  type ConsensusTransport,
  type CoordinatorEngineOptions,
} from "./consensus.js";
export {
  SwarmNode,
  type ActionClass,
  type LeaseDecision,
  type LeaseDenyCode,
  type SwarmNodeOptions,
} from "./node.js";
export {
  fileSignGuardStore,
  memorySignGuardStore,
  SignGuard,
  type SignGuardRecord,
  type SignGuardStore,
} from "./sign-guard.js";
