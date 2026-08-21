import Foundation

// Stable identifier used for both the macOS LaunchAgent label and Nix-managed defaults suite.
// nix-enclawed writes app defaults into this suite to survive app bundle identifier churn.
let launchdLabel = "ai.enclawed.mac"
let gatewayLaunchdLabel = "ai.enclawed.gateway"
let onboardingVersionKey = "enclawed.onboardingVersion"
let onboardingSeenKey = "enclawed.onboardingSeen"
let currentOnboardingVersion = 7
let pauseDefaultsKey = "enclawed.pauseEnabled"
let iconAnimationsEnabledKey = "enclawed.iconAnimationsEnabled"
let swabbleEnabledKey = "enclawed.swabbleEnabled"
let swabbleTriggersKey = "enclawed.swabbleTriggers"
let voiceWakeTriggerChimeKey = "enclawed.voiceWakeTriggerChime"
let voiceWakeSendChimeKey = "enclawed.voiceWakeSendChime"
let showDockIconKey = "enclawed.showDockIcon"
let defaultVoiceWakeTriggers = ["enclawed"]
let voiceWakeMaxWords = 32
let voiceWakeMaxWordLength = 64
let voiceWakeMicKey = "enclawed.voiceWakeMicID"
let voiceWakeMicNameKey = "enclawed.voiceWakeMicName"
let voiceWakeLocaleKey = "enclawed.voiceWakeLocaleID"
let voiceWakeAdditionalLocalesKey = "enclawed.voiceWakeAdditionalLocaleIDs"
let voicePushToTalkEnabledKey = "enclawed.voicePushToTalkEnabled"
let voiceWakeTriggersTalkModeKey = "enclawed.voiceWakeTriggersTalkMode"
let talkEnabledKey = "enclawed.talkEnabled"
let iconOverrideKey = "enclawed.iconOverride"
let connectionModeKey = "enclawed.connectionMode"
let remoteTargetKey = "enclawed.remoteTarget"
let remoteIdentityKey = "enclawed.remoteIdentity"
let remoteProjectRootKey = "enclawed.remoteProjectRoot"
let remoteCliPathKey = "enclawed.remoteCliPath"
let canvasEnabledKey = "enclawed.canvasEnabled"
let cameraEnabledKey = "enclawed.cameraEnabled"
let systemRunPolicyKey = "enclawed.systemRunPolicy"
let systemRunAllowlistKey = "enclawed.systemRunAllowlist"
let systemRunEnabledKey = "enclawed.systemRunEnabled"
let locationModeKey = "enclawed.locationMode"
let locationPreciseKey = "enclawed.locationPreciseEnabled"
let peekabooBridgeEnabledKey = "enclawed.peekabooBridgeEnabled"
let deepLinkKeyKey = "enclawed.deepLinkKey"
let modelCatalogPathKey = "enclawed.modelCatalogPath"
let modelCatalogReloadKey = "enclawed.modelCatalogReload"
let cliInstallPromptedVersionKey = "enclawed.cliInstallPromptedVersion"
let heartbeatsEnabledKey = "enclawed.heartbeatsEnabled"
let debugPaneEnabledKey = "enclawed.debugPaneEnabled"
let debugFileLogEnabledKey = "enclawed.debug.fileLogEnabled"
let appLogLevelKey = "enclawed.debug.appLogLevel"
let voiceWakeSupported: Bool = ProcessInfo.processInfo.operatingSystemVersion.majorVersion >= 26
