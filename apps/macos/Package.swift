// swift-tools-version: 6.2
// Package manifest for the Enclawed macOS companion (menu bar app + IPC library).

import PackageDescription

let package = Package(
    name: "Enclawed",
    platforms: [
        .macOS(.v15),
    ],
    products: [
        .library(name: "EnclawedIPC", targets: ["EnclawedIPC"]),
        .library(name: "EnclawedDiscovery", targets: ["EnclawedDiscovery"]),
        .executable(name: "Enclawed", targets: ["Enclawed"]),
        .executable(name: "enclawed-mac", targets: ["EnclawedMacCLI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/orchetect/MenuBarExtraAccess", exact: "1.2.2"),
        .package(url: "https://github.com/swiftlang/swift-subprocess.git", from: "0.4.0"),
        .package(url: "https://github.com/apple/swift-log.git", from: "1.10.1"),
        .package(url: "https://github.com/sparkle-project/Sparkle", from: "2.9.0"),
        .package(url: "https://github.com/steipete/Peekaboo.git", branch: "main"),
        .package(url: "https://github.com/Blaizzy/mlx-audio-swift", exact: "0.1.2"),
        .package(path: "../shared/EnclawedKit"),
        .package(path: "../../Swabble"),
    ],
    targets: [
        .target(
            name: "EnclawedIPC",
            dependencies: [],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "EnclawedDiscovery",
            dependencies: [
                .product(name: "EnclawedKit", package: "EnclawedKit"),
            ],
            path: "Sources/EnclawedDiscovery",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .executableTarget(
            name: "Enclawed",
            dependencies: [
                "EnclawedIPC",
                "EnclawedDiscovery",
                .product(name: "EnclawedKit", package: "EnclawedKit"),
                .product(name: "EnclawedChatUI", package: "EnclawedKit"),
                .product(name: "EnclawedProtocol", package: "EnclawedKit"),
                .product(name: "SwabbleKit", package: "swabble"),
                .product(name: "MenuBarExtraAccess", package: "MenuBarExtraAccess"),
                .product(name: "Subprocess", package: "swift-subprocess"),
                .product(name: "Logging", package: "swift-log"),
                .product(name: "Sparkle", package: "Sparkle"),
                .product(name: "PeekabooBridge", package: "Peekaboo"),
                .product(name: "PeekabooAutomationKit", package: "Peekaboo"),
                .product(name: "MLXAudioTTS", package: "mlx-audio-swift"),
            ],
            exclude: [
                "Resources/Info.plist",
            ],
            resources: [
                .copy("Resources/Enclawed.icns"),
                .copy("Resources/DeviceModels"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .executableTarget(
            name: "EnclawedMacCLI",
            dependencies: [
                "EnclawedDiscovery",
                .product(name: "EnclawedKit", package: "EnclawedKit"),
                .product(name: "EnclawedProtocol", package: "EnclawedKit"),
            ],
            path: "Sources/EnclawedMacCLI",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .testTarget(
            name: "EnclawedIPCTests",
            dependencies: [
                "EnclawedIPC",
                "Enclawed",
                "EnclawedDiscovery",
                .product(name: "EnclawedProtocol", package: "EnclawedKit"),
                .product(name: "SwabbleKit", package: "swabble"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
                .enableExperimentalFeature("SwiftTesting"),
            ]),
    ])
