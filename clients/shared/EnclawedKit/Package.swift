// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "EnclawedKit",
    platforms: [
        .iOS(.v18),
        .macOS(.v15),
    ],
    products: [
        .library(name: "EnclawedProtocol", targets: ["EnclawedProtocol"]),
        .library(name: "EnclawedKit", targets: ["EnclawedKit"]),
        .library(name: "EnclawedChatUI", targets: ["EnclawedChatUI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/steipete/ElevenLabsKit", exact: "0.1.0"),
        .package(url: "https://github.com/gonzalezreal/textual", exact: "0.3.1"),
    ],
    targets: [
        .target(
            name: "EnclawedProtocol",
            path: "Sources/EnclawedProtocol",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "EnclawedKit",
            dependencies: [
                "EnclawedProtocol",
                .product(name: "ElevenLabsKit", package: "ElevenLabsKit"),
            ],
            path: "Sources/EnclawedKit",
            resources: [
                .process("Resources"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "EnclawedChatUI",
            dependencies: [
                "EnclawedKit",
                .product(
                    name: "Textual",
                    package: "textual",
                    condition: .when(platforms: [.macOS, .iOS])),
            ],
            path: "Sources/EnclawedChatUI",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .testTarget(
            name: "EnclawedKitTests",
            dependencies: ["EnclawedKit", "EnclawedChatUI"],
            path: "Tests/EnclawedKitTests",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
                .enableExperimentalFeature("SwiftTesting"),
            ]),
    ])
