import Foundation
import AVFoundation
import Combine

/// ViewModel for the Voice Lab — managing voice preview, recording, and cloning.
@MainActor
final class VoiceLabViewModel: ObservableObject {
    // MARK: - Published State

    @Published var isPreviewing = false
    @Published var previewProfile: VoiceProfile?
    @Published var isRecordingClone = false
    @Published var cloneProgress: Double = 0
    @Published var recordedBuffer: AVAudioPCMBuffer?

    // MARK: - Private

    private let audioEngine = AudioEngine.shared
    private let voiceProcessor = VoiceProcessor()
    private var audioRecorder: AVAudioRecorder?
    private var recordingURL: URL?
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Preview

    func startPreview() {
        guard let profile = previewProfile else { return }

        audioEngine.applyProfile(profile)
        do {
            try audioEngine.start()
            isPreviewing = true
        } catch {
            print("[VoiceLabVM] Preview start failed: \(error.localizedDescription)")
        }
    }

    func stopPreview() {
        audioEngine.stop()
        audioEngine.applyProfile(nil)
        isPreviewing = false
    }

    func selectPreviewProfile(_ profile: VoiceProfile) {
        previewProfile = profile

        // If currently previewing, apply the new profile immediately
        if isPreviewing {
            audioEngine.applyProfile(profile)
        }
    }

    func updatePreviewPitch(_ value: Float) {
        previewProfile?.pitchShift = value
        if isPreviewing, let profile = previewProfile {
            audioEngine.applyProfile(profile)
        }
    }

    func updatePreviewFormant(_ value: Float) {
        previewProfile?.formantShift = value
        if isPreviewing, let profile = previewProfile {
            audioEngine.applyProfile(profile)
        }
    }

    // MARK: - Voice Cloning Recording

    func startCloneRecording() {
        let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let fileName = "clone_recording_\(UUID().uuidString).wav"
        recordingURL = documentsPath.appendingPathComponent(fileName)

        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatLinearPCM),
            AVSampleRateKey: 48000.0,
            AVNumberOfChannelsKey: 1,
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsFloatKey: false
        ]

        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement)
            try session.setActive(true)

            audioRecorder = try AVAudioRecorder(url: recordingURL!, settings: settings)
            audioRecorder?.record()
            isRecordingClone = true
        } catch {
            print("[VoiceLabVM] Clone recording failed: \(error.localizedDescription)")
        }
    }

    func stopCloneRecording() {
        audioRecorder?.stop()
        isRecordingClone = false

        // Load the recorded audio for processing
        if let url = recordingURL {
            loadRecordedAudio(from: url)
        }
    }

    private func loadRecordedAudio(from url: URL) {
        do {
            let audioFile = try AVAudioFile(forReading: url)
            let format = audioFile.processingFormat
            let frameCount = AVAudioFrameCount(audioFile.length)

            guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else { return }
            try audioFile.read(into: buffer)

            recordedBuffer = buffer
        } catch {
            print("[VoiceLabVM] Failed to load recording: \(error.localizedDescription)")
        }
    }

    // MARK: - Save Cloned Voice

    func saveClonedVoice(name: String) {
        guard let buffer = recordedBuffer else { return }

        // Extract voice embedding
        guard let embeddingData = voiceProcessor.extractEmbedding(from: buffer) else {
            print("[VoiceLabVM] Failed to extract voice embedding")
            return
        }

        let profile = VoiceProfile(
            name: name,
            category: .celebrity,
            isClonedVoice: true,
            cloneEmbeddingData: embeddingData,
            iconName: "person.wave.2.fill"
        )

        VoiceProfileStore.shared.save(profile)

        // Cleanup recording file
        if let url = recordingURL {
            try? FileManager.default.removeItem(at: url)
        }

        recordedBuffer = nil
        recordingURL = nil
    }
}
