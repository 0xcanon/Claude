import Accelerate

/// Utility class for performing FFT operations using the Accelerate framework.
final class FFTProcessor {
    private let fftSize: Int
    private let log2n: vDSP_Length
    private let fftSetup: FFTSetup

    private var realBuffer: [Float]
    private var imagBuffer: [Float]
    private var window: [Float]

    init(fftSize: Int = 2048) {
        self.fftSize = fftSize
        self.log2n = vDSP_Length(log2(Float(fftSize)))
        self.fftSetup = vDSP_create_fftsetup(log2n, FFTRadix(kFFTRadix2))!

        self.realBuffer = [Float](repeating: 0, count: fftSize / 2)
        self.imagBuffer = [Float](repeating: 0, count: fftSize / 2)
        self.window = [Float](repeating: 0, count: fftSize)
        vDSP_hann_window(&self.window, vDSP_Length(fftSize), Int32(vDSP_HANN_NORM))
    }

    deinit {
        vDSP_destroy_fftsetup(fftSetup)
    }

    /// Compute magnitude spectrum of a signal.
    func magnitudeSpectrum(_ signal: [Float]) -> [Float] {
        var windowed = [Float](repeating: 0, count: fftSize)
        let count = min(signal.count, fftSize)
        for i in 0..<count {
            windowed[i] = signal[i] * window[i]
        }

        var splitComplex = DSPSplitComplex(
            realp: &realBuffer,
            imagp: &imagBuffer
        )

        windowed.withUnsafeBufferPointer { ptr in
            ptr.baseAddress!.withMemoryRebound(to: DSPComplex.self, capacity: fftSize / 2) { complexPtr in
                vDSP_ctoz(complexPtr, 2, &splitComplex, 1, vDSP_Length(fftSize / 2))
            }
        }

        vDSP_fft_zrip(fftSetup, &splitComplex, 1, log2n, FFTDirection(kFFTDirection_Forward))

        var magnitudes = [Float](repeating: 0, count: fftSize / 2)
        vDSP_zvmags(&splitComplex, 1, &magnitudes, 1, vDSP_Length(fftSize / 2))

        // Convert to dB
        var one: Float = 1.0
        vDSP_vdbcon(&magnitudes, 1, &one, &magnitudes, 1, vDSP_Length(fftSize / 2), 0)

        return magnitudes
    }

    /// Compute power spectral density.
    func powerSpectralDensity(_ signal: [Float]) -> [Float] {
        let mags = magnitudeSpectrum(signal)
        var psd = mags
        var scale = 1.0 / Float(fftSize)
        vDSP_vsmul(psd, 1, &scale, &psd, 1, vDSP_Length(psd.count))
        return psd
    }

    /// Estimate fundamental frequency (pitch detection) using autocorrelation.
    func estimatePitch(_ signal: [Float], sampleRate: Float) -> Float? {
        let frameSize = min(signal.count, fftSize)
        var autocorr = [Float](repeating: 0, count: frameSize)

        // Autocorrelation via FFT
        for lag in 0..<frameSize / 2 {
            var sum: Float = 0
            vDSP_dotpr(signal, 1, signal.advanced(by: lag), 1, &sum, vDSP_Length(frameSize - lag))
            autocorr[lag] = sum
        }

        // Find first peak after the initial drop
        guard autocorr[0] > 0 else { return nil }

        // Normalize
        var invR0 = 1.0 / autocorr[0]
        vDSP_vsmul(autocorr, 1, &invR0, &autocorr, 1, vDSP_Length(frameSize / 2))

        // Find the first dip then the next peak
        var foundDip = false
        var peakLag = 0
        var peakValue: Float = 0

        let minLag = Int(sampleRate / 500) // Max freq ~500Hz
        let maxLag = Int(sampleRate / 60)  // Min freq ~60Hz

        for lag in minLag..<min(maxLag, frameSize / 2) {
            if !foundDip && autocorr[lag] < 0.5 {
                foundDip = true
            }
            if foundDip && autocorr[lag] > peakValue {
                peakValue = autocorr[lag]
                peakLag = lag
            }
        }

        guard peakLag > 0 && peakValue > 0.3 else { return nil }

        return sampleRate / Float(peakLag)
    }
}
