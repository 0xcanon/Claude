import Foundation
import AVFoundation

/// Global audio configuration for the app.
struct AudioSettings: Codable {
    var sampleRate: Double = 48000
    var bufferSize: AVAudioFrameCount = 256
    var inputGain: Float = 1.0
    var outputGain: Float = 1.0
    var noiseSuppression: Bool = true
    var echoCancellation: Bool = true
    var automaticGainControl: Bool = true
    var highPassFilterEnabled: Bool = true
    var highPassCutoff: Float = 80 // Hz
    var processingQuality: ProcessingQuality = .high

    enum ProcessingQuality: String, Codable, CaseIterable {
        case low = "Low Latency"
        case medium = "Balanced"
        case high = "High Quality"

        var fftSize: Int {
            switch self {
            case .low: return 512
            case .medium: return 1024
            case .high: return 2048
            }
        }

        var hopSize: Int {
            switch self {
            case .low: return 128
            case .medium: return 256
            case .high: return 512
            }
        }

        var overlapFactor: Int {
            switch self {
            case .low: return 4
            case .medium: return 4
            case .high: return 4
            }
        }
    }

    /// Optimal buffer size for the device, balancing latency and stability.
    var optimalBufferDuration: TimeInterval {
        switch processingQuality {
        case .low: return 0.003    // 3ms
        case .medium: return 0.005 // 5ms
        case .high: return 0.010   // 10ms
        }
    }
}
