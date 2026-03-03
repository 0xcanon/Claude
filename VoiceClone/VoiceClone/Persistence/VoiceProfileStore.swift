import Foundation
import Combine

/// Persistent store for custom voice profiles.
final class VoiceProfileStore: ObservableObject {
    static let shared = VoiceProfileStore()

    @Published var profiles: [VoiceProfile] = []

    private let fileManager = FileManager.default
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    private var storageURL: URL {
        let documentsDir = fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return documentsDir.appendingPathComponent("voice_profiles.json")
    }

    private init() {
        loadProfiles()
    }

    // MARK: - CRUD

    func save(_ profile: VoiceProfile) {
        if let index = profiles.firstIndex(where: { $0.id == profile.id }) {
            var updated = profile
            updated = VoiceProfile(
                id: profile.id,
                name: profile.name,
                category: profile.category,
                pitchShift: profile.pitchShift,
                formantShift: profile.formantShift,
                reverbMix: profile.reverbMix,
                compressorThreshold: profile.compressorThreshold,
                noiseGateThreshold: profile.noiseGateThreshold,
                isClonedVoice: profile.isClonedVoice,
                cloneEmbeddingData: profile.cloneEmbeddingData,
                iconName: profile.iconName
            )
            profiles[index] = updated
        } else {
            profiles.append(profile)
        }
        persistProfiles()
    }

    func delete(_ profile: VoiceProfile) {
        profiles.removeAll { $0.id == profile.id }
        persistProfiles()
    }

    func delete(at offsets: IndexSet) {
        profiles.remove(atOffsets: offsets)
        persistProfiles()
    }

    // MARK: - Persistence

    private func loadProfiles() {
        guard fileManager.fileExists(atPath: storageURL.path) else { return }

        do {
            let data = try Data(contentsOf: storageURL)
            profiles = try decoder.decode([VoiceProfile].self, from: data)
            print("[VoiceProfileStore] Loaded \(profiles.count) profiles")
        } catch {
            print("[VoiceProfileStore] Load failed: \(error.localizedDescription)")
        }
    }

    private func persistProfiles() {
        do {
            let data = try encoder.encode(profiles)
            try data.write(to: storageURL, options: .atomic)
        } catch {
            print("[VoiceProfileStore] Save failed: \(error.localizedDescription)")
        }
    }
}
