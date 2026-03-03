import AVFoundation
import Accelerate
import Combine

/// Central audio engine managing the real-time processing graph.
/// Routes microphone input through the DSP chain and outputs processed audio.
final class AudioEngine: ObservableObject {
    static let shared = AudioEngine()

    // MARK: - Published State

    @Published var isRunning = false
    @Published var inputLevel: Float = 0
    @Published var outputLevel: Float = 0
    @Published var currentLatencyMs: Double = 0
    @Published var metrics = AudioQualityMetrics()

    // MARK: - Audio Graph

    private let engine = AVAudioEngine()
    private let playerNode = AVAudioPlayerNode()
    private let mixerNode = AVAudioMixerNode()

    // MARK: - Processing Chain

    private let voiceProcessor = VoiceProcessor()
    private let pitchShifter = PitchShifter()
    private let formantShifter = FormantShifter()
    private let bufferManager = AudioBufferManager()

    // MARK: - Configuration

    private(set) var settings = AudioSettings()
    private var activeProfile: VoiceProfile?
    private let processingQueue = DispatchQueue(
        label: "com.voiceclone.audio.processing",
        qos: .userInteractive
    )
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Callbacks

    var onProcessedAudio: ((AVAudioPCMBuffer) -> Void)?

    private init() {
        setupNotifications()
    }

    // MARK: - Engine Lifecycle

    func start() throws {
        guard !isRunning else { return }

        let session = AVAudioSession.sharedInstance()
        try session.setCategory(
            .playAndRecord,
            mode: .voiceChat,
            options: [.allowBluetooth, .defaultToSpeaker]
        )
        try session.setPreferredSampleRate(settings.sampleRate)
        try session.setPreferredIOBufferDuration(settings.optimalBufferDuration)
        try session.setActive(true)

        configureAudioGraph()
        try engine.start()

        DispatchQueue.main.async {
            self.isRunning = true
        }

        print("[AudioEngine] Started — SR: \(session.sampleRate)Hz, Buffer: \(session.ioBufferDuration * 1000)ms")
    }

    func stop() {
        guard isRunning else { return }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        engine.reset()

        DispatchQueue.main.async {
            self.isRunning = false
            self.inputLevel = 0
            self.outputLevel = 0
        }

        print("[AudioEngine] Stopped")
    }

    // MARK: - Configuration

    func applyProfile(_ profile: VoiceProfile?) {
        activeProfile = profile
        guard let profile = profile else {
            pitchShifter.reset()
            formantShifter.reset()
            return
        }

        pitchShifter.pitchShiftSemitones = profile.pitchShift
        formantShifter.formantRatio = profile.formantShift

        if profile.isClonedVoice, let embeddingData = profile.cloneEmbeddingData {
            voiceProcessor.loadCloneEmbedding(embeddingData)
        }

        print("[AudioEngine] Applied profile: \(profile.name)")
    }

    func updateSettings(_ newSettings: AudioSettings) {
        let needsRestart = settings.sampleRate != newSettings.sampleRate ||
            settings.bufferSize != newSettings.bufferSize

        settings = newSettings
        pitchShifter.configure(
            fftSize: newSettings.processingQuality.fftSize,
            hopSize: newSettings.processingQuality.hopSize
        )

        if needsRestart && isRunning {
            stop()
            try? start()
        }
    }

    // MARK: - Audio Graph Setup

    private func configureAudioGraph() {
        let inputNode = engine.inputNode
        let inputFormat = inputNode.outputFormat(forBus: 0)
        let processingFormat = AVAudioFormat(
            standardFormatWithSampleRate: settings.sampleRate,
            channels: 1
        )!

        engine.attach(playerNode)
        engine.attach(mixerNode)

        // Input -> Mixer -> MainMixer -> Output
        engine.connect(playerNode, to: mixerNode, format: processingFormat)
        engine.connect(mixerNode, to: engine.mainMixerNode, format: processingFormat)

        // Install tap on input for processing
        inputNode.installTap(
            onBus: 0,
            bufferSize: settings.bufferSize,
            format: inputFormat
        ) { [weak self] buffer, time in
            self?.processInputBuffer(buffer, time: time)
        }
    }

    // MARK: - Real-Time Processing

    private func processInputBuffer(_ buffer: AVAudioPCMBuffer, time: AVAudioTime) {
        let startTime = CFAbsoluteTimeGetCurrent()

        // Measure input level
        let inLevel = Self.calculateRMSLevel(buffer)
        DispatchQueue.main.async { self.inputLevel = inLevel }

        // Noise gate
        guard let profile = activeProfile else {
            // Pass-through when no profile is active
            outputRawBuffer(buffer)
            return
        }

        let noiseThreshold = powf(10, profile.noiseGateThreshold / 20.0)
        guard inLevel > noiseThreshold else {
            outputSilence(frameCount: buffer.frameLength, format: buffer.format)
            return
        }

        processingQueue.async { [weak self] in
            guard let self = self else { return }

            // Convert to mono float buffer for processing
            guard let monoBuffer = self.bufferManager.convertToMono(buffer) else { return }

            // === DSP Chain ===

            // 1. High-pass filter (remove rumble)
            var processed = monoBuffer
            if self.settings.highPassFilterEnabled {
                processed = self.applyHighPassFilter(processed)
            }

            // 2. Compressor
            processed = self.applyCompressor(processed, threshold: profile.compressorThreshold)

            // 3. Pitch shift (time-domain PSOLA or frequency-domain phase vocoder)
            if profile.pitchShift != 0 {
                processed = self.pitchShifter.process(processed)
            }

            // 4. Formant shift
            if profile.formantShift != 1.0 {
                processed = self.formantShifter.process(processed)
            }

            // 5. Voice cloning neural processing
            if profile.isClonedVoice {
                processed = self.voiceProcessor.applyCloneTransform(processed)
            }

            // 6. Output gain
            self.applyGain(processed, gain: self.settings.outputGain)

            // Measure output level
            let outLevel = Self.calculateRMSLevel(processed)
            DispatchQueue.main.async {
                self.outputLevel = outLevel
            }

            // Measure processing latency
            let elapsed = (CFAbsoluteTimeGetCurrent() - startTime) * 1000
            DispatchQueue.main.async {
                self.currentLatencyMs = elapsed
                self.metrics.latencyMs = elapsed
            }

            // Schedule processed audio for playback
            self.scheduleProcessedBuffer(processed)

            // Send to VoIP stream
            self.onProcessedAudio?(processed)
        }
    }

    private func outputRawBuffer(_ buffer: AVAudioPCMBuffer) {
        guard let monoBuffer = bufferManager.convertToMono(buffer) else { return }
        scheduleProcessedBuffer(monoBuffer)
        onProcessedAudio?(monoBuffer)
    }

    private func outputSilence(frameCount: AVAudioFrameCount, format: AVAudioFormat) {
        guard let silentBuffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else { return }
        silentBuffer.frameLength = frameCount
        memset(silentBuffer.floatChannelData![0], 0, Int(frameCount) * MemoryLayout<Float>.size)
        scheduleProcessedBuffer(silentBuffer)
    }

    private func scheduleProcessedBuffer(_ buffer: AVAudioPCMBuffer) {
        playerNode.scheduleBuffer(buffer, completionHandler: nil)
        if !playerNode.isPlaying {
            playerNode.play()
        }
    }

    // MARK: - DSP Utilities

    private func applyHighPassFilter(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer {
        guard let channelData = buffer.floatChannelData?[0] else { return buffer }
        let frameCount = Int(buffer.frameLength)
        let sampleRate = Float(buffer.format.sampleRate)

        // Simple first-order IIR high-pass filter
        let rc = 1.0 / (2.0 * Float.pi * settings.highPassCutoff)
        let dt = 1.0 / sampleRate
        let alpha = rc / (rc + dt)

        var previousInput: Float = 0
        var previousOutput: Float = 0

        for i in 0..<frameCount {
            let input = channelData[i]
            let output = alpha * (previousOutput + input - previousInput)
            channelData[i] = output
            previousInput = input
            previousOutput = output
        }

        return buffer
    }

    private func applyCompressor(
        _ buffer: AVAudioPCMBuffer,
        threshold: Float,
        ratio: Float = 4.0,
        attackMs: Float = 5.0,
        releaseMs: Float = 50.0
    ) -> AVAudioPCMBuffer {
        guard let channelData = buffer.floatChannelData?[0] else { return buffer }
        let frameCount = Int(buffer.frameLength)
        let sampleRate = Float(buffer.format.sampleRate)

        let thresholdLinear = powf(10, threshold / 20.0)
        let attackCoeff = expf(-1.0 / (attackMs * 0.001 * sampleRate))
        let releaseCoeff = expf(-1.0 / (releaseMs * 0.001 * sampleRate))

        var envelope: Float = 0

        for i in 0..<frameCount {
            let inputAbs = abs(channelData[i])

            if inputAbs > envelope {
                envelope = attackCoeff * envelope + (1 - attackCoeff) * inputAbs
            } else {
                envelope = releaseCoeff * envelope + (1 - releaseCoeff) * inputAbs
            }

            if envelope > thresholdLinear {
                let gainReduction = thresholdLinear * powf(envelope / thresholdLinear, 1.0 / ratio - 1.0)
                channelData[i] *= gainReduction
            }
        }

        return buffer
    }

    private func applyGain(_ buffer: AVAudioPCMBuffer, gain: Float) {
        guard let channelData = buffer.floatChannelData?[0] else { return }
        var gainValue = gain
        let frameCount = Int(buffer.frameLength)
        vDSP_vsmul(channelData, 1, &gainValue, channelData, 1, vDSP_Length(frameCount))
    }

    static func calculateRMSLevel(_ buffer: AVAudioPCMBuffer) -> Float {
        guard let channelData = buffer.floatChannelData?[0] else { return 0 }
        let frameCount = Int(buffer.frameLength)
        var rms: Float = 0
        vDSP_rmsqv(channelData, 1, &rms, vDSP_Length(frameCount))
        return rms
    }

    // MARK: - Notifications

    private func setupNotifications() {
        NotificationCenter.default.publisher(for: AVAudioSession.interruptionNotification)
            .sink { [weak self] notification in
                self?.handleInterruption(notification)
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: AVAudioSession.routeChangeNotification)
            .sink { [weak self] notification in
                self?.handleRouteChange(notification)
            }
            .store(in: &cancellables)
    }

    private func handleInterruption(_ notification: Notification) {
        guard let info = notification.userInfo,
              let typeValue = info[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeValue) else { return }

        switch type {
        case .began:
            stop()
        case .ended:
            if let optionsValue = info[AVAudioSessionInterruptionOptionKey] as? UInt {
                let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
                if options.contains(.shouldResume) {
                    try? start()
                }
            }
        @unknown default:
            break
        }
    }

    private func handleRouteChange(_ notification: Notification) {
        guard let info = notification.userInfo,
              let reasonValue = info[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue) else { return }

        switch reason {
        case .oldDeviceUnavailable:
            // Headphones unplugged — restart engine
            if isRunning {
                stop()
                try? start()
            }
        default:
            break
        }
    }
}
