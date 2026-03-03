import AVFoundation
import Accelerate

/// Manages audio buffer conversions and ring buffers for the processing pipeline.
final class AudioBufferManager {
    private let targetSampleRate: Double = 48000
    private var converter: AVAudioConverter?

    /// Convert a multi-channel buffer to mono Float32 at the target sample rate.
    func convertToMono(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
        let inputFormat = buffer.format
        let monoFormat = AVAudioFormat(
            standardFormatWithSampleRate: targetSampleRate,
            channels: 1
        )!

        // Fast path: already mono at target rate
        if inputFormat.channelCount == 1 &&
            inputFormat.sampleRate == targetSampleRate &&
            inputFormat.commonFormat == .pcmFormatFloat32 {
            return buffer
        }

        // Calculate output frame count for sample rate conversion
        let ratio = targetSampleRate / inputFormat.sampleRate
        let outputFrameCount = AVAudioFrameCount(Double(buffer.frameLength) * ratio)

        guard let outputBuffer = AVAudioPCMBuffer(
            pcmFormat: monoFormat,
            frameCapacity: outputFrameCount
        ) else { return nil }

        // If just needs channel downmix (same sample rate)
        if inputFormat.sampleRate == targetSampleRate && inputFormat.channelCount > 1 {
            return downmixToMono(buffer, output: outputBuffer)
        }

        // Full conversion with AVAudioConverter
        if converter == nil || converter?.inputFormat != inputFormat {
            converter = AVAudioConverter(from: inputFormat, to: monoFormat)
        }

        guard let converter = converter else { return nil }

        var error: NSError?
        let status = converter.convert(to: outputBuffer, error: &error) { _, outStatus in
            outStatus.pointee = .haveData
            return buffer
        }

        if status == .error {
            print("[BufferManager] Conversion error: \(error?.localizedDescription ?? "unknown")")
            return nil
        }

        return outputBuffer
    }

    /// Downmix multi-channel to mono by averaging channels.
    private func downmixToMono(
        _ input: AVAudioPCMBuffer,
        output: AVAudioPCMBuffer
    ) -> AVAudioPCMBuffer {
        let frameCount = Int(input.frameLength)
        let channelCount = Int(input.format.channelCount)
        output.frameLength = input.frameLength

        guard let outputData = output.floatChannelData?[0],
              let inputData = input.floatChannelData else { return output }

        // Zero output
        memset(outputData, 0, frameCount * MemoryLayout<Float>.size)

        // Sum all channels
        for ch in 0..<channelCount {
            vDSP_vadd(outputData, 1, inputData[ch], 1, outputData, 1, vDSP_Length(frameCount))
        }

        // Normalize
        var scale = 1.0 / Float(channelCount)
        vDSP_vsmul(outputData, 1, &scale, outputData, 1, vDSP_Length(frameCount))

        return output
    }

    /// Create a silent buffer of specified duration.
    func createSilentBuffer(
        duration: TimeInterval,
        format: AVAudioFormat
    ) -> AVAudioPCMBuffer? {
        let frameCount = AVAudioFrameCount(duration * format.sampleRate)
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else {
            return nil
        }
        buffer.frameLength = frameCount
        memset(
            buffer.floatChannelData![0],
            0,
            Int(frameCount) * MemoryLayout<Float>.size
        )
        return buffer
    }

    /// Concatenate two audio buffers.
    func concatenate(_ a: AVAudioPCMBuffer, _ b: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
        guard a.format == b.format else { return nil }
        let totalFrames = a.frameLength + b.frameLength
        guard let output = AVAudioPCMBuffer(pcmFormat: a.format, frameCapacity: totalFrames) else {
            return nil
        }
        output.frameLength = totalFrames

        let outputData = output.floatChannelData![0]
        memcpy(outputData, a.floatChannelData![0], Int(a.frameLength) * MemoryLayout<Float>.size)
        memcpy(
            outputData.advanced(by: Int(a.frameLength)),
            b.floatChannelData![0],
            Int(b.frameLength) * MemoryLayout<Float>.size
        )

        return output
    }

    /// Extract a segment from a buffer.
    func extractSegment(
        from buffer: AVAudioPCMBuffer,
        startFrame: AVAudioFrameCount,
        frameCount: AVAudioFrameCount
    ) -> AVAudioPCMBuffer? {
        guard startFrame + frameCount <= buffer.frameLength else { return nil }
        guard let output = AVAudioPCMBuffer(pcmFormat: buffer.format, frameCapacity: frameCount) else {
            return nil
        }
        output.frameLength = frameCount

        memcpy(
            output.floatChannelData![0],
            buffer.floatChannelData![0].advanced(by: Int(startFrame)),
            Int(frameCount) * MemoryLayout<Float>.size
        )

        return output
    }
}

/// Thread-safe circular buffer for audio samples.
final class CircularAudioBuffer {
    private var buffer: [Float]
    private var readIndex = 0
    private var writeIndex = 0
    private let capacity: Int
    private let lock = NSLock()

    var availableFrames: Int {
        lock.lock()
        defer { lock.unlock() }
        let available = writeIndex - readIndex
        return available >= 0 ? available : available + capacity
    }

    init(capacity: Int) {
        self.capacity = capacity
        self.buffer = [Float](repeating: 0, count: capacity)
    }

    func write(_ data: UnsafePointer<Float>, count: Int) {
        lock.lock()
        defer { lock.unlock() }

        for i in 0..<count {
            buffer[writeIndex % capacity] = data[i]
            writeIndex = (writeIndex + 1) % capacity
        }
    }

    func read(_ data: UnsafeMutablePointer<Float>, count: Int) -> Int {
        lock.lock()
        defer { lock.unlock() }

        let available = min(count, availableFrames)
        for i in 0..<available {
            data[i] = buffer[readIndex % capacity]
            readIndex = (readIndex + 1) % capacity
        }
        return available
    }

    func reset() {
        lock.lock()
        defer { lock.unlock() }
        readIndex = 0
        writeIndex = 0
        memset(&buffer, 0, capacity * MemoryLayout<Float>.size)
    }
}
