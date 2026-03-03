import Foundation

/// Represents a saved voice profile that can be applied during calls.
struct VoiceProfile: Identifiable, Codable, Hashable {
    let id: UUID
    var name: String
    var category: Category
    var pitchShift: Float        // Semitones: -12 to +12
    var formantShift: Float      // Ratio: 0.5 to 2.0
    var reverbMix: Float         // 0.0 to 1.0
    var compressorThreshold: Float // dB: -40 to 0
    var noiseGateThreshold: Float  // dB: -80 to -20
    var isClonedVoice: Bool
    var cloneEmbeddingData: Data?  // Serialized voice embedding vector
    var createdAt: Date
    var updatedAt: Date
    var iconName: String

    enum Category: String, Codable, CaseIterable {
        case custom = "Custom"
        case deepVoice = "Deep Voice"
        case highPitch = "High Pitch"
        case robot = "Robot"
        case celebrity = "Celebrity Clone"
        case anonymous = "Anonymous"
        case natural = "Natural"
    }

    init(
        id: UUID = UUID(),
        name: String,
        category: Category = .custom,
        pitchShift: Float = 0,
        formantShift: Float = 1.0,
        reverbMix: Float = 0,
        compressorThreshold: Float = -20,
        noiseGateThreshold: Float = -50,
        isClonedVoice: Bool = false,
        cloneEmbeddingData: Data? = nil,
        iconName: String = "waveform"
    ) {
        self.id = id
        self.name = name
        self.category = category
        self.pitchShift = pitchShift
        self.formantShift = formantShift
        self.reverbMix = reverbMix
        self.compressorThreshold = compressorThreshold
        self.noiseGateThreshold = noiseGateThreshold
        self.isClonedVoice = isClonedVoice
        self.cloneEmbeddingData = cloneEmbeddingData
        self.createdAt = Date()
        self.updatedAt = Date()
        self.iconName = iconName
    }

    // MARK: - Presets

    static let presets: [VoiceProfile] = [
        VoiceProfile(
            name: "Deep Bass",
            category: .deepVoice,
            pitchShift: -5,
            formantShift: 0.8,
            reverbMix: 0.05,
            iconName: "speaker.wave.3.fill"
        ),
        VoiceProfile(
            name: "Chipmunk",
            category: .highPitch,
            pitchShift: 8,
            formantShift: 1.6,
            iconName: "hare.fill"
        ),
        VoiceProfile(
            name: "Robotic",
            category: .robot,
            pitchShift: 0,
            formantShift: 1.0,
            reverbMix: 0.3,
            iconName: "cpu"
        ),
        VoiceProfile(
            name: "Anonymous",
            category: .anonymous,
            pitchShift: -3,
            formantShift: 0.7,
            reverbMix: 0.1,
            noiseGateThreshold: -40,
            iconName: "person.fill.questionmark"
        ),
        VoiceProfile(
            name: "Natural Enhanced",
            category: .natural,
            pitchShift: 0,
            formantShift: 1.0,
            compressorThreshold: -15,
            noiseGateThreshold: -45,
            iconName: "mic.fill"
        ),
    ]
}
