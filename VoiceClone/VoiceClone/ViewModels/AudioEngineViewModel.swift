import Foundation
import Combine

/// ViewModel bridging the AudioEngine to SwiftUI views.
@MainActor
final class AudioEngineViewModel: ObservableObject {
    // MARK: - Published State

    @Published var isRunning = false
    @Published var inputLevel: Float = 0
    @Published var outputLevel: Float = 0
    @Published var currentLatencyMs: Double = 0
    @Published var metrics = AudioQualityMetrics()

    // MARK: - Private

    private let audioEngine = AudioEngine.shared
    private var cancellables = Set<AnyCancellable>()

    func initialize() {
        audioEngine.$isRunning
            .receive(on: DispatchQueue.main)
            .assign(to: &$isRunning)

        audioEngine.$inputLevel
            .receive(on: DispatchQueue.main)
            .assign(to: &$inputLevel)

        audioEngine.$outputLevel
            .receive(on: DispatchQueue.main)
            .assign(to: &$outputLevel)

        audioEngine.$currentLatencyMs
            .receive(on: DispatchQueue.main)
            .assign(to: &$currentLatencyMs)

        audioEngine.$metrics
            .receive(on: DispatchQueue.main)
            .assign(to: &$metrics)
    }

    func start() {
        do {
            try audioEngine.start()
        } catch {
            print("[AudioEngineVM] Failed to start: \(error.localizedDescription)")
        }
    }

    func stop() {
        audioEngine.stop()
    }

    func applyProfile(_ profile: VoiceProfile?) {
        audioEngine.applyProfile(profile)
    }

    func updateSettings(_ settings: AudioSettings) {
        audioEngine.updateSettings(settings)
    }
}
