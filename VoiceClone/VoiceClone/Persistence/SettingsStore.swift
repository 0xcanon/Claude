import Foundation
import Combine

/// Persistent settings store using UserDefaults.
final class SettingsStore: ObservableObject {
    static let shared = SettingsStore()

    // MARK: - Audio Settings

    @Published var audioSettings: AudioSettings {
        didSet { saveAudioSettings() }
    }

    // MARK: - Server Settings

    @Published var serverHost: String {
        didSet { UserDefaults.standard.set(serverHost, forKey: Keys.serverHost) }
    }

    @Published var serverPort: Int {
        didSet { UserDefaults.standard.set(serverPort, forKey: Keys.serverPort) }
    }

    // MARK: - App Settings

    @Published var hapticFeedback: Bool {
        didSet { UserDefaults.standard.set(hapticFeedback, forKey: Keys.hapticFeedback) }
    }

    @Published var showLatencyOverlay: Bool {
        didSet { UserDefaults.standard.set(showLatencyOverlay, forKey: Keys.showLatency) }
    }

    // MARK: - Keys

    private enum Keys {
        static let audioSettings = "audio_settings"
        static let serverHost = "server_host"
        static let serverPort = "server_port"
        static let hapticFeedback = "haptic_feedback"
        static let showLatency = "show_latency"
    }

    private init() {
        // Load saved settings or use defaults
        if let data = UserDefaults.standard.data(forKey: Keys.audioSettings),
           let settings = try? JSONDecoder().decode(AudioSettings.self, from: data) {
            audioSettings = settings
        } else {
            audioSettings = AudioSettings()
        }

        serverHost = UserDefaults.standard.string(forKey: Keys.serverHost) ?? "voip.example.com"
        serverPort = UserDefaults.standard.integer(forKey: Keys.serverPort).nonZero ?? 443
        hapticFeedback = UserDefaults.standard.bool(forKey: Keys.hapticFeedback, default: true)
        showLatencyOverlay = UserDefaults.standard.bool(forKey: Keys.showLatency, default: false)
    }

    private func saveAudioSettings() {
        if let data = try? JSONEncoder().encode(audioSettings) {
            UserDefaults.standard.set(data, forKey: Keys.audioSettings)
        }
    }
}

// MARK: - Helpers

private extension Int {
    var nonZero: Int? { self == 0 ? nil : self }
}

private extension UserDefaults {
    func bool(forKey key: String, default defaultValue: Bool) -> Bool {
        if object(forKey: key) == nil {
            return defaultValue
        }
        return bool(forKey: key)
    }
}
