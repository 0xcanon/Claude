import Foundation

enum Constants {
    enum Audio {
        static let defaultSampleRate: Double = 48000
        static let defaultBufferSize: UInt32 = 256
        static let maxPitchShift: Float = 12.0
        static let minPitchShift: Float = -12.0
        static let maxFormantRatio: Float = 2.0
        static let minFormantRatio: Float = 0.5
        static let defaultFFTSize = 2048
        static let defaultHopSize = 512
        static let voiceEmbeddingDimension = 256
        static let minRecordingDurationForClone: TimeInterval = 30
    }

    enum VoIP {
        static let rtpHeaderSize = 12
        static let opusPayloadType: UInt8 = 111
        static let opusFrameDurationMs = 20
        static let jitterBufferDepth = 5
        static let maxPacketSize = 2048
    }

    enum UI {
        static let waveformBarCount = 40
        static let meterSegmentCount = 20
        static let animationFrameRate: TimeInterval = 1.0 / 30.0
    }
}
