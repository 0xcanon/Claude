import Foundation
import CallKit

/// Represents an active or historical call session.
struct CallSession: Identifiable {
    let id: UUID
    let handle: String
    let direction: Direction
    var state: State
    var voiceProfile: VoiceProfile?
    var startTime: Date?
    var endTime: Date?
    var duration: TimeInterval { (endTime ?? Date()).timeIntervalSince(startTime ?? Date()) }
    var isMuted: Bool = false
    var isOnHold: Bool = false
    var isVoiceEffectActive: Bool = true
    var inputLevel: Float = 0
    var outputLevel: Float = 0

    enum Direction: String, Codable {
        case incoming
        case outgoing
    }

    enum State: String {
        case idle
        case ringing
        case connecting
        case active
        case onHold
        case ended
        case failed
    }

    init(
        id: UUID = UUID(),
        handle: String,
        direction: Direction,
        state: State = .idle,
        voiceProfile: VoiceProfile? = nil
    ) {
        self.id = id
        self.handle = handle
        self.direction = direction
        self.state = state
        self.voiceProfile = voiceProfile
    }

    var formattedDuration: String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }
}

/// Audio quality metrics for monitoring call quality.
struct AudioQualityMetrics {
    var latencyMs: Double = 0
    var jitterMs: Double = 0
    var packetLossPercent: Double = 0
    var signalToNoiseRatio: Float = 0
    var bufferUnderruns: Int = 0
    var sampleRate: Double = 48000
    var bitDepth: Int = 16

    var qualityRating: QualityRating {
        if latencyMs < 50 && packetLossPercent < 1 && jitterMs < 20 {
            return .excellent
        } else if latencyMs < 150 && packetLossPercent < 3 && jitterMs < 50 {
            return .good
        } else if latencyMs < 300 && packetLossPercent < 5 {
            return .fair
        } else {
            return .poor
        }
    }

    enum QualityRating: String {
        case excellent = "Excellent"
        case good = "Good"
        case fair = "Fair"
        case poor = "Poor"

        var color: String {
            switch self {
            case .excellent: return "green"
            case .good: return "blue"
            case .fair: return "orange"
            case .poor: return "red"
            }
        }
    }
}
