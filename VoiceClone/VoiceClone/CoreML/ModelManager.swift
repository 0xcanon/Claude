import Foundation
import AVFoundation
import CoreML

/// Manages CoreML voice encoder and decoder models for on-device voice cloning.
final class ModelManager {
    static let shared = ModelManager()

    // MARK: - State

    private var voiceEncoder: VoiceEncoderModel?
    private var voiceDecoder: VoiceDecoderModel?
    private(set) var isModelLoaded = false
    private(set) var modelLoadError: String?

    private let modelQueue = DispatchQueue(
        label: "com.voiceclone.model",
        qos: .userInitiated
    )

    private init() {
        loadModels()
    }

    // MARK: - Model Loading

    private func loadModels() {
        modelQueue.async { [weak self] in
            guard let self = self else { return }

            do {
                self.voiceEncoder = try VoiceEncoderModel()
                self.voiceDecoder = try VoiceDecoderModel()
                self.isModelLoaded = true
                print("[ModelManager] Models loaded successfully")
            } catch {
                self.modelLoadError = error.localizedDescription
                print("[ModelManager] Model loading failed: \(error.localizedDescription)")
                print("[ModelManager] Voice cloning will use spectral fallback")
            }
        }
    }

    // MARK: - Voice Encoding

    /// Extract a voice embedding vector from an audio buffer.
    func encodeVoice(buffer: AVAudioPCMBuffer) -> [Float]? {
        guard let encoder = voiceEncoder else { return nil }
        return encoder.encode(buffer: buffer)
    }

    // MARK: - Voice Conversion

    /// Convert audio buffer to match target voice embedding.
    func convertVoice(
        buffer: AVAudioPCMBuffer,
        targetEmbedding: [Float]
    ) -> AVAudioPCMBuffer? {
        guard let decoder = voiceDecoder else { return nil }
        return decoder.convert(buffer: buffer, targetEmbedding: targetEmbedding)
    }
}

// MARK: - Voice Encoder Model Wrapper

/// Wraps the CoreML voice encoder that extracts speaker embeddings.
final class VoiceEncoderModel {
    private let model: MLModel?
    private let embeddingDim = 256
    private let inputFrameSize = 16000 // ~1 second at 16kHz

    init() throws {
        // Attempt to load the compiled CoreML model
        // In production, bundle a .mlmodelc file trained on speaker verification
        if let modelURL = Bundle.main.url(forResource: "VoiceEncoder", withExtension: "mlmodelc") {
            let config = MLModelConfiguration()
            config.computeUnits = .cpuAndNeuralEngine
            self.model = try MLModel(contentsOf: modelURL, configuration: config)
        } else {
            self.model = nil
            print("[VoiceEncoder] Model file not found — using MFCC fallback")
        }
    }

    func encode(buffer: AVAudioPCMBuffer) -> [Float]? {
        guard let model = model,
              let channelData = buffer.floatChannelData?[0] else { return nil }

        let frameCount = min(Int(buffer.frameLength), inputFrameSize)

        do {
            // Prepare input as MLMultiArray
            let inputArray = try MLMultiArray(shape: [1, NSNumber(value: inputFrameSize)], dataType: .float32)
            for i in 0..<inputFrameSize {
                inputArray[i] = NSNumber(value: i < frameCount ? channelData[i] : 0)
            }

            let inputFeatures = try MLDictionaryFeatureProvider(
                dictionary: ["audio_input": MLFeatureValue(multiArray: inputArray)]
            )

            let prediction = try model.prediction(from: inputFeatures)

            // Extract embedding vector
            guard let embeddingArray = prediction.featureValue(for: "embedding")?.multiArrayValue else {
                return nil
            }

            var embedding = [Float](repeating: 0, count: embeddingDim)
            for i in 0..<embeddingDim {
                embedding[i] = embeddingArray[i].floatValue
            }

            // L2 normalize
            var norm: Float = 0
            vDSP_svesq(embedding, 1, &norm, vDSP_Length(embeddingDim))
            norm = sqrtf(norm)
            if norm > 0 {
                var invNorm = 1.0 / norm
                vDSP_vsmul(embedding, 1, &invNorm, &embedding, 1, vDSP_Length(embeddingDim))
            }

            return embedding
        } catch {
            print("[VoiceEncoder] Prediction failed: \(error.localizedDescription)")
            return nil
        }
    }
}

// MARK: - Voice Decoder Model Wrapper

/// Wraps the CoreML voice decoder that performs real-time voice conversion.
final class VoiceDecoderModel {
    private let model: MLModel?
    private let frameSize = 1024

    init() throws {
        if let modelURL = Bundle.main.url(forResource: "VoiceDecoder", withExtension: "mlmodelc") {
            let config = MLModelConfiguration()
            config.computeUnits = .cpuAndNeuralEngine
            self.model = try MLModel(contentsOf: modelURL, configuration: config)
        } else {
            self.model = nil
            print("[VoiceDecoder] Model file not found — using spectral fallback")
        }
    }

    func convert(
        buffer: AVAudioPCMBuffer,
        targetEmbedding: [Float]
    ) -> AVAudioPCMBuffer? {
        guard let model = model,
              let channelData = buffer.floatChannelData?[0] else { return nil }

        let totalFrames = Int(buffer.frameLength)

        guard let outputBuffer = AVAudioPCMBuffer(
            pcmFormat: buffer.format,
            frameCapacity: buffer.frameCapacity
        ) else { return nil }
        outputBuffer.frameLength = buffer.frameLength
        let outputData = outputBuffer.floatChannelData![0]

        // Process in chunks
        var position = 0
        while position + frameSize <= totalFrames {
            do {
                // Audio chunk input
                let audioInput = try MLMultiArray(
                    shape: [1, NSNumber(value: frameSize)],
                    dataType: .float32
                )
                for i in 0..<frameSize {
                    audioInput[i] = NSNumber(value: channelData[position + i])
                }

                // Target embedding input
                let embeddingInput = try MLMultiArray(
                    shape: [1, NSNumber(value: targetEmbedding.count)],
                    dataType: .float32
                )
                for i in 0..<targetEmbedding.count {
                    embeddingInput[i] = NSNumber(value: targetEmbedding[i])
                }

                let inputFeatures = try MLDictionaryFeatureProvider(dictionary: [
                    "audio_input": MLFeatureValue(multiArray: audioInput),
                    "target_embedding": MLFeatureValue(multiArray: embeddingInput)
                ])

                let prediction = try model.prediction(from: inputFeatures)

                if let outputArray = prediction.featureValue(for: "audio_output")?.multiArrayValue {
                    for i in 0..<frameSize {
                        outputData[position + i] = outputArray[i].floatValue
                    }
                }
            } catch {
                // On failure, pass through original audio for this chunk
                memcpy(
                    outputData.advanced(by: position),
                    channelData.advanced(by: position),
                    frameSize * MemoryLayout<Float>.size
                )
            }

            position += frameSize
        }

        // Copy remaining samples unchanged
        if position < totalFrames {
            memcpy(
                outputData.advanced(by: position),
                channelData.advanced(by: position),
                (totalFrames - position) * MemoryLayout<Float>.size
            )
        }

        return outputBuffer
    }
}
