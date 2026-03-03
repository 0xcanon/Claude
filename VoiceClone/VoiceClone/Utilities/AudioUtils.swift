import AVFoundation
import Accelerate

enum AudioUtils {
    /// Convert decibels to linear amplitude.
    static func dbToLinear(_ db: Float) -> Float {
        powf(10.0, db / 20.0)
    }

    /// Convert linear amplitude to decibels.
    static func linearToDb(_ linear: Float) -> Float {
        20.0 * log10f(max(linear, 1e-10))
    }

    /// Convert frequency in Hz to mel scale.
    static func hzToMel(_ hz: Float) -> Float {
        2595.0 * log10f(1.0 + hz / 700.0)
    }

    /// Convert mel scale to frequency in Hz.
    static func melToHz(_ mel: Float) -> Float {
        700.0 * (powf(10.0, mel / 2595.0) - 1.0)
    }

    /// Compute RMS level of a float array.
    static func rmsLevel(_ samples: UnsafePointer<Float>, count: Int) -> Float {
        var rms: Float = 0
        vDSP_rmsqv(samples, 1, &rms, vDSP_Length(count))
        return rms
    }

    /// Normalize audio buffer to peak amplitude of 1.0.
    static func normalize(_ buffer: AVAudioPCMBuffer) {
        guard let data = buffer.floatChannelData?[0] else { return }
        let count = Int(buffer.frameLength)

        var peak: Float = 0
        vDSP_maxmgv(data, 1, &peak, vDSP_Length(count))

        guard peak > 0 else { return }
        var scale = 1.0 / peak
        vDSP_vsmul(data, 1, &scale, data, 1, vDSP_Length(count))
    }

    /// Apply fade-in to a buffer.
    static func fadeIn(_ buffer: AVAudioPCMBuffer, durationSamples: Int) {
        guard let data = buffer.floatChannelData?[0] else { return }
        let count = min(durationSamples, Int(buffer.frameLength))

        for i in 0..<count {
            let gain = Float(i) / Float(count)
            data[i] *= gain
        }
    }

    /// Apply fade-out to a buffer.
    static func fadeOut(_ buffer: AVAudioPCMBuffer, durationSamples: Int) {
        guard let data = buffer.floatChannelData?[0] else { return }
        let totalFrames = Int(buffer.frameLength)
        let count = min(durationSamples, totalFrames)
        let startIndex = totalFrames - count

        for i in 0..<count {
            let gain = Float(count - i) / Float(count)
            data[startIndex + i] *= gain
        }
    }
}
