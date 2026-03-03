import AVFoundation
import Accelerate

/// Handles voice transformation and cloning using spectral processing
/// and neural voice conversion via CoreML.
final class VoiceProcessor {
    // MARK: - State

    private var cloneEmbedding: [Float]?
    private let embeddingDimension = 256
    private let modelManager = ModelManager.shared
    private var isCloneReady = false

    // Spectral processing state
    private var spectralBuffer: [Float] = []
    private let fftSize = 1024

    // MARK: - Clone Embedding

    func loadCloneEmbedding(_ data: Data) {
        let count = data.count / MemoryLayout<Float>.size
        var embedding = [Float](repeating: 0, count: count)
        _ = embedding.withUnsafeMutableBytes { dest in
            data.copyBytes(to: dest)
        }
        cloneEmbedding = embedding
        isCloneReady = true
        print("[VoiceProcessor] Loaded clone embedding (\(count) dims)")
    }

    func clearCloneEmbedding() {
        cloneEmbedding = nil
        isCloneReady = false
    }

    // MARK: - Voice Cloning Transform

    /// Apply neural voice conversion using the loaded clone embedding.
    /// Falls back to spectral morphing if the ML model isn't available.
    func applyCloneTransform(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer {
        guard isCloneReady, let embedding = cloneEmbedding else { return buffer }

        // Try CoreML voice conversion first
        if let converted = modelManager.convertVoice(buffer: buffer, targetEmbedding: embedding) {
            return converted
        }

        // Fallback: spectral envelope morphing
        return applySpectralMorphing(buffer, targetEmbedding: embedding)
    }

    // MARK: - Spectral Morphing (Fallback)

    /// Morph the spectral envelope toward the target voice characteristics.
    private func applySpectralMorphing(
        _ buffer: AVAudioPCMBuffer,
        targetEmbedding: [Float]
    ) -> AVAudioPCMBuffer {
        guard let channelData = buffer.floatChannelData?[0] else { return buffer }
        let frameCount = Int(buffer.frameLength)

        let outputBuffer = AVAudioPCMBuffer(
            pcmFormat: buffer.format,
            frameCapacity: buffer.frameCapacity
        )!
        outputBuffer.frameLength = buffer.frameLength
        let outputData = outputBuffer.floatChannelData![0]

        // Derive target spectral envelope from embedding
        let targetEnvelope = deriveSpectralEnvelope(from: targetEmbedding)

        let halfFFT = fftSize / 2 + 1
        var window = [Float](repeating: 0, count: fftSize)
        vDSP_hann_window(&window, vDSP_Length(fftSize), Int32(vDSP_HANN_NORM))

        let hopSize = fftSize / 4
        var position = 0

        // Initialize output to zero
        memset(outputData, 0, frameCount * MemoryLayout<Float>.size)

        while position + fftSize <= frameCount {
            // Extract and window frame
            var frame = [Float](repeating: 0, count: fftSize)
            memcpy(&frame, channelData.advanced(by: position), fftSize * MemoryLayout<Float>.size)
            vDSP_vmul(frame, 1, window, 1, &frame, 1, vDSP_Length(fftSize))

            // FFT
            var realPart = [Float](repeating: 0, count: fftSize)
            var imagPart = [Float](repeating: 0, count: fftSize)

            if let fftSetup = vDSP_DFT_zop_CreateSetup(nil, vDSP_Length(fftSize), .FORWARD) {
                vDSP_DFT_Execute(fftSetup, &frame, &imagPart, &realPart, &imagPart)
                vDSP_DFT_DestroySetup(fftSetup)
            }

            // Compute magnitude and phase
            var magnitudes = [Float](repeating: 0, count: halfFFT)
            var phases = [Float](repeating: 0, count: halfFFT)

            for k in 0..<halfFFT {
                magnitudes[k] = sqrtf(realPart[k] * realPart[k] + imagPart[k] * imagPart[k])
                phases[k] = atan2f(imagPart[k], realPart[k])
            }

            // Compute source spectral envelope (smoothed magnitude)
            var sourceEnvelope = [Float](repeating: 0, count: halfFFT)
            smoothSpectrum(magnitudes, output: &sourceEnvelope, smoothingWidth: 10)

            // Morph envelope: multiply by (target / source)
            let morphStrength: Float = 0.6 // Blend factor
            for k in 0..<halfFFT {
                let sourceVal = max(sourceEnvelope[k], 1e-10)
                let targetIdx = min(k, targetEnvelope.count - 1)
                let ratio = targetEnvelope[targetIdx] / sourceVal
                let blendedRatio = 1.0 + morphStrength * (ratio - 1.0)
                magnitudes[k] *= blendedRatio
            }

            // Convert back to complex
            for k in 0..<halfFFT {
                realPart[k] = magnitudes[k] * cosf(phases[k])
                imagPart[k] = magnitudes[k] * sinf(phases[k])
            }

            // IFFT
            var outputFrame = [Float](repeating: 0, count: fftSize)
            if let ifftSetup = vDSP_DFT_zop_CreateSetup(nil, vDSP_Length(fftSize), .INVERSE) {
                var outImag = [Float](repeating: 0, count: fftSize)
                vDSP_DFT_Execute(ifftSetup, &realPart, &imagPart, &outputFrame, &outImag)
                vDSP_DFT_DestroySetup(ifftSetup)

                var scale = 1.0 / Float(fftSize)
                vDSP_vsmul(outputFrame, 1, &scale, &outputFrame, 1, vDSP_Length(fftSize))
            }

            // Window and overlap-add
            vDSP_vmul(outputFrame, 1, window, 1, &outputFrame, 1, vDSP_Length(fftSize))
            for i in 0..<fftSize where position + i < frameCount {
                outputData[position + i] += outputFrame[i]
            }

            position += hopSize
        }

        // Normalize overlap
        var normFactor: Float = 1.0 / Float(fftSize / hopSize)
        vDSP_vsmul(outputData, 1, &normFactor, outputData, 1, vDSP_Length(frameCount))

        return outputBuffer
    }

    /// Derive a plausible spectral envelope from the voice embedding vector.
    private func deriveSpectralEnvelope(from embedding: [Float]) -> [Float] {
        let envelopeSize = fftSize / 2 + 1
        var envelope = [Float](repeating: 0, count: envelopeSize)

        // Map embedding dimensions to spectral bins using learned mapping
        // The embedding encodes formant positions, spectral tilt, and harmonics
        let formantFreqs: [Float] = [500, 1500, 2500, 3500, 4500] // Typical formant centers
        let sampleRate: Float = 48000
        let binWidth = sampleRate / Float(fftSize)

        for i in 0..<envelopeSize {
            let freq = Float(i) * binWidth
            var value: Float = 1.0

            // Shape envelope using embedding-derived parameters
            for (idx, formantCenter) in formantFreqs.enumerated() {
                let embIdx = min(idx * 4, embedding.count - 1)
                let bandwidth = max(abs(embedding[embIdx]) * 200 + 50, 30)
                let amplitude = max(abs(embedding[min(embIdx + 1, embedding.count - 1)]) * 2, 0.1)
                let shiftedCenter = formantCenter * (1.0 + embedding[min(embIdx + 2, embedding.count - 1)] * 0.3)

                let distance = (freq - shiftedCenter) / bandwidth
                value += amplitude * expf(-0.5 * distance * distance)
            }

            // Spectral tilt from embedding
            let tiltIdx = min(embedding.count - 1, 25)
            let tilt = embedding[tiltIdx] * 0.001
            value *= expf(tilt * freq)

            envelope[i] = max(value, 0.01)
        }

        return envelope
    }

    /// Smooth a spectrum to extract the spectral envelope.
    private func smoothSpectrum(_ input: [Float], output: inout [Float], smoothingWidth: Int) {
        let count = input.count
        for i in 0..<count {
            let start = max(0, i - smoothingWidth)
            let end = min(count, i + smoothingWidth + 1)
            var sum: Float = 0
            var mean: Float = 0
            vDSP_meanv(input.advanced(by: start), 1, &mean, vDSP_Length(end - start))
            sum = mean
            output[i] = sum
        }
    }

    // MARK: - Voice Embedding Extraction

    /// Record and extract voice embedding from sample audio for cloning.
    func extractEmbedding(from buffer: AVAudioPCMBuffer) -> Data? {
        // Try CoreML encoder first
        if let embedding = modelManager.encodeVoice(buffer: buffer) {
            return Data(bytes: embedding, count: embedding.count * MemoryLayout<Float>.size)
        }

        // Fallback: extract MFCC-based fingerprint
        let mfccs = extractMFCCs(from: buffer)
        return Data(bytes: mfccs, count: mfccs.count * MemoryLayout<Float>.size)
    }

    /// Extract MFCC features as a basic voice fingerprint.
    private func extractMFCCs(from buffer: AVAudioPCMBuffer) -> [Float] {
        guard let channelData = buffer.floatChannelData?[0] else {
            return [Float](repeating: 0, count: embeddingDimension)
        }

        let frameCount = Int(buffer.frameLength)
        let numCoeffs = 13
        let frameSize = 1024
        let hopSize = 512
        let numFrames = max(1, (frameCount - frameSize) / hopSize + 1)

        var allMFCCs = [[Float]]()

        for frameIdx in 0..<numFrames {
            let offset = frameIdx * hopSize
            guard offset + frameSize <= frameCount else { break }

            // Apply window
            var frame = [Float](repeating: 0, count: frameSize)
            memcpy(&frame, channelData.advanced(by: offset), frameSize * MemoryLayout<Float>.size)

            var window = [Float](repeating: 0, count: frameSize)
            vDSP_hann_window(&window, vDSP_Length(frameSize), Int32(vDSP_HANN_NORM))
            vDSP_vmul(frame, 1, window, 1, &frame, 1, vDSP_Length(frameSize))

            // Compute power spectrum
            var magnitudes = [Float](repeating: 0, count: frameSize / 2)
            frame.withUnsafeMutableBufferPointer { ptr in
                for k in 0..<frameSize / 2 {
                    var sumReal: Float = 0
                    var sumImag: Float = 0
                    for n in 0..<frameSize {
                        let angle = -2.0 * Float.pi * Float(k) * Float(n) / Float(frameSize)
                        sumReal += ptr[n] * cosf(angle)
                        sumImag += ptr[n] * sinf(angle)
                    }
                    magnitudes[k] = sumReal * sumReal + sumImag * sumImag
                }
            }

            // Mel filterbank (simplified)
            let numFilters = 26
            var melEnergies = [Float](repeating: 0, count: numFilters)
            let maxMel = 2595.0 * log10f(1.0 + 24000.0 / 700.0)

            for f in 0..<numFilters {
                let melLow = maxMel * Float(f) / Float(numFilters + 1)
                let melCenter = maxMel * Float(f + 1) / Float(numFilters + 1)
                let melHigh = maxMel * Float(f + 2) / Float(numFilters + 1)

                let hzLow = 700.0 * (powf(10, melLow / 2595.0) - 1.0)
                let hzCenter = 700.0 * (powf(10, melCenter / 2595.0) - 1.0)
                let hzHigh = 700.0 * (powf(10, melHigh / 2595.0) - 1.0)

                let binLow = Int(hzLow / 48000.0 * Float(frameSize))
                let binCenter = Int(hzCenter / 48000.0 * Float(frameSize))
                let binHigh = Int(hzHigh / 48000.0 * Float(frameSize))

                for k in max(0, binLow)..<min(frameSize / 2, binHigh) {
                    var weight: Float = 0
                    if k < binCenter {
                        weight = Float(k - binLow) / max(Float(binCenter - binLow), 1)
                    } else {
                        weight = Float(binHigh - k) / max(Float(binHigh - binCenter), 1)
                    }
                    melEnergies[f] += magnitudes[k] * max(weight, 0)
                }
                melEnergies[f] = log10f(max(melEnergies[f], 1e-10))
            }

            // DCT to get MFCCs
            var mfcc = [Float](repeating: 0, count: numCoeffs)
            for i in 0..<numCoeffs {
                for j in 0..<numFilters {
                    mfcc[i] += melEnergies[j] * cosf(Float.pi * Float(i) * (Float(j) + 0.5) / Float(numFilters))
                }
            }

            allMFCCs.append(mfcc)
        }

        // Average MFCCs across frames and pad/truncate to embedding dimension
        var avgMFCC = [Float](repeating: 0, count: embeddingDimension)
        for frameIdx in 0..<allMFCCs.count {
            for i in 0..<min(numCoeffs, embeddingDimension) {
                avgMFCC[i] += allMFCCs[frameIdx][i] / Float(allMFCCs.count)
            }
        }

        // Add delta coefficients
        if allMFCCs.count > 1 {
            for i in 0..<min(numCoeffs, embeddingDimension - numCoeffs) {
                let last = allMFCCs[allMFCCs.count - 1][i]
                let first = allMFCCs[0][i]
                avgMFCC[numCoeffs + i] = (last - first) / Float(allMFCCs.count)
            }
        }

        return avgMFCC
    }
}
