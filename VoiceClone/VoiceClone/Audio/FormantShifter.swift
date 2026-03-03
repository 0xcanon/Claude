import AVFoundation
import Accelerate

/// Shifts voice formants independently of pitch using LPC (Linear Predictive Coding).
/// Formant shifting changes the perceived vocal tract shape, enabling gender/age changes.
final class FormantShifter {
    // MARK: - Configuration

    var formantRatio: Float = 1.0  // < 1.0 = deeper, > 1.0 = higher
    private let lpcOrder: Int = 32 // LPC analysis order
    private var sampleRate: Float = 48000

    // MARK: - State

    private var previousOutput: [Float] = []

    func reset() {
        formantRatio = 1.0
        previousOutput = []
    }

    // MARK: - Processing

    func process(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer {
        guard formantRatio != 1.0,
              let channelData = buffer.floatChannelData?[0] else { return buffer }

        let frameCount = Int(buffer.frameLength)
        sampleRate = Float(buffer.format.sampleRate)

        let outputBuffer = AVAudioPCMBuffer(
            pcmFormat: buffer.format,
            frameCapacity: buffer.frameCapacity
        )!
        outputBuffer.frameLength = buffer.frameLength
        let outputData = outputBuffer.floatChannelData![0]

        // Process in overlapping frames
        let frameSize = 512
        let hopSize = 256

        var position = 0
        var outputPosition = 0

        // Hann window
        var window = [Float](repeating: 0, count: frameSize)
        vDSP_hann_window(&window, vDSP_Length(frameSize), Int32(vDSP_HANN_NORM))

        while position + frameSize <= frameCount {
            var frame = [Float](repeating: 0, count: frameSize)
            memcpy(&frame, channelData.advanced(by: position), frameSize * MemoryLayout<Float>.size)

            // Apply window
            vDSP_vmul(frame, 1, window, 1, &frame, 1, vDSP_Length(frameSize))

            // Extract LPC coefficients (spectral envelope)
            let lpcCoeffs = computeLPC(frame, order: lpcOrder)

            // Compute residual (excitation signal)
            let residual = computeResidual(frame, lpcCoeffs: lpcCoeffs)

            // Warp LPC coefficients to shift formants
            let warpedCoeffs = warpLPCCoefficients(lpcCoeffs, ratio: formantRatio)

            // Resynthesize with warped envelope
            let resynthesized = synthesize(residual: residual, lpcCoeffs: warpedCoeffs)

            // Apply window for overlap-add
            var windowedOutput = [Float](repeating: 0, count: frameSize)
            vDSP_vmul(resynthesized, 1, window, 1, &windowedOutput, 1, vDSP_Length(frameSize))

            // Overlap-add to output
            for i in 0..<min(hopSize, frameCount - outputPosition) {
                if outputPosition + i < frameCount {
                    outputData[outputPosition + i] += windowedOutput[i]
                }
            }

            position += hopSize
            outputPosition += hopSize
        }

        // Normalize
        var normFactor: Float = 0.5
        vDSP_vsmul(outputData, 1, &normFactor, outputData, 1, vDSP_Length(frameCount))

        return outputBuffer
    }

    // MARK: - LPC Analysis

    /// Compute LPC coefficients using Levinson-Durbin recursion.
    private func computeLPC(_ signal: [Float], order: Int) -> [Float] {
        let n = signal.count

        // Autocorrelation
        var autocorr = [Float](repeating: 0, count: order + 1)
        for lag in 0...order {
            var sum: Float = 0
            vDSP_dotpr(signal, 1, signal.advanced(by: lag), 1, &sum, vDSP_Length(n - lag))
            autocorr[lag] = sum
        }

        // Levinson-Durbin
        guard autocorr[0] > 0 else { return [Float](repeating: 0, count: order) }

        var coeffs = [Float](repeating: 0, count: order)
        var error = autocorr[0]

        for i in 0..<order {
            // Calculate reflection coefficient
            var lambda: Float = 0
            for j in 0..<i {
                lambda += coeffs[j] * autocorr[i - j]
            }
            lambda = (autocorr[i + 1] - lambda) / error

            // Update coefficients
            var newCoeffs = [Float](repeating: 0, count: order)
            newCoeffs[i] = lambda
            for j in 0..<i {
                newCoeffs[j] = coeffs[j] - lambda * coeffs[i - 1 - j]
            }
            coeffs = newCoeffs

            error *= (1.0 - lambda * lambda)
            guard error > 0 else { break }
        }

        return coeffs
    }

    /// Compute residual signal by inverse filtering.
    private func computeResidual(_ signal: [Float], lpcCoeffs: [Float]) -> [Float] {
        let n = signal.count
        var residual = [Float](repeating: 0, count: n)

        for i in 0..<n {
            residual[i] = signal[i]
            for j in 0..<lpcCoeffs.count {
                if i - j - 1 >= 0 {
                    residual[i] += lpcCoeffs[j] * signal[i - j - 1]
                }
            }
        }

        return residual
    }

    /// Warp LPC coefficients using first-order allpass warping.
    private func warpLPCCoefficients(_ coeffs: [Float], ratio: Float) -> [Float] {
        // Bilinear frequency warping parameter
        let alpha = (1.0 - ratio) / (1.0 + ratio)
        let order = coeffs.count

        var warped = [Float](repeating: 0, count: order)
        var delay = [Float](repeating: 0, count: order + 1)

        // Pass LPC coefficients through allpass chain
        for i in 0..<order {
            delay[0] = coeffs[i]
            for j in 0..<order {
                let input = delay[j]
                let output = -alpha * warped[j] + delay[j + 1]
                warped[j] = alpha * output + input
                delay[j + 1] = output
            }
        }

        return warped
    }

    /// Synthesize signal from residual using LPC filter.
    private func synthesize(residual: [Float], lpcCoeffs: [Float]) -> [Float] {
        let n = residual.count
        var output = [Float](repeating: 0, count: n)

        for i in 0..<n {
            output[i] = residual[i]
            for j in 0..<lpcCoeffs.count {
                if i - j - 1 >= 0 {
                    output[i] -= lpcCoeffs[j] * output[i - j - 1]
                }
            }
        }

        return output
    }
}
