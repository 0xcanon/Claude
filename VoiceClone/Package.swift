// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "VoiceClone",
    platforms: [
        .iOS(.v16)
    ],
    products: [
        .library(
            name: "VoiceClone",
            targets: ["VoiceClone"]
        ),
    ],
    targets: [
        .target(
            name: "VoiceClone",
            path: "VoiceClone/VoiceClone",
            exclude: ["App/Info.plist"],
            linkerSettings: [
                .linkedFramework("AVFoundation"),
                .linkedFramework("CallKit"),
                .linkedFramework("PushKit"),
                .linkedFramework("CoreML"),
                .linkedFramework("Accelerate"),
                .linkedFramework("Network"),
                .linkedFramework("UIKit"),
            ]
        ),
        .testTarget(
            name: "VoiceCloneTests",
            dependencies: ["VoiceClone"],
            path: "VoiceClone/VoiceCloneTests"
        ),
    ]
)
