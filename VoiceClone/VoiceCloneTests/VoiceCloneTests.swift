import XCTest

final class VoiceCloneTests: XCTestCase {

    // MARK: - VoiceProfile Tests

    func testVoiceProfileCreation() {
        let profile = VoiceProfile(
            name: "Test Voice",
            category: .custom,
            pitchShift: 3.0,
            formantShift: 1.2
        )

        XCTAssertEqual(profile.name, "Test Voice")
        XCTAssertEqual(profile.category, .custom)
        XCTAssertEqual(profile.pitchShift, 3.0)
        XCTAssertEqual(profile.formantShift, 1.2)
        XCTAssertFalse(profile.isClonedVoice)
    }

    func testVoiceProfilePresets() {
        XCTAssertFalse(VoiceProfile.presets.isEmpty)
        XCTAssertEqual(VoiceProfile.presets.count, 5)

        // Verify all presets have unique names
        let names = Set(VoiceProfile.presets.map(\.name))
        XCTAssertEqual(names.count, VoiceProfile.presets.count)
    }

    func testVoiceProfileCodable() throws {
        let profile = VoiceProfile(
            name: "Codable Test",
            pitchShift: -4.0,
            formantShift: 0.8,
            reverbMix: 0.3
        )

        let encoder = JSONEncoder()
        let data = try encoder.encode(profile)
        XCTAssertFalse(data.isEmpty)

        let decoder = JSONDecoder()
        let decoded = try decoder.decode(VoiceProfile.self, from: data)
        XCTAssertEqual(decoded.name, profile.name)
        XCTAssertEqual(decoded.pitchShift, profile.pitchShift)
        XCTAssertEqual(decoded.formantShift, profile.formantShift)
        XCTAssertEqual(decoded.reverbMix, profile.reverbMix)
    }

    // MARK: - AudioSettings Tests

    func testAudioSettingsDefaults() {
        let settings = AudioSettings()

        XCTAssertEqual(settings.sampleRate, 48000)
        XCTAssertEqual(settings.bufferSize, 256)
        XCTAssertEqual(settings.inputGain, 1.0)
        XCTAssertEqual(settings.outputGain, 1.0)
        XCTAssertTrue(settings.noiseSuppression)
        XCTAssertTrue(settings.echoCancellation)
    }

    func testProcessingQualityFFTSizes() {
        XCTAssertEqual(AudioSettings.ProcessingQuality.low.fftSize, 512)
        XCTAssertEqual(AudioSettings.ProcessingQuality.medium.fftSize, 1024)
        XCTAssertEqual(AudioSettings.ProcessingQuality.high.fftSize, 2048)
    }

    // MARK: - CallSession Tests

    func testCallSessionCreation() {
        let session = CallSession(
            handle: "+15551234567",
            direction: .outgoing
        )

        XCTAssertEqual(session.handle, "+15551234567")
        XCTAssertEqual(session.direction, .outgoing)
        XCTAssertEqual(session.state, .idle)
        XCTAssertFalse(session.isMuted)
        XCTAssertFalse(session.isOnHold)
        XCTAssertTrue(session.isVoiceEffectActive)
    }

    func testCallSessionFormattedDuration() {
        var session = CallSession(handle: "test", direction: .incoming)
        session.startTime = Date().addingTimeInterval(-125) // 2 min 5 sec ago
        session.endTime = Date()

        XCTAssertEqual(session.formattedDuration, "02:05")
    }

    // MARK: - AudioQualityMetrics Tests

    func testAudioQualityRating() {
        var metrics = AudioQualityMetrics()

        metrics.latencyMs = 30
        metrics.packetLossPercent = 0.5
        metrics.jitterMs = 10
        XCTAssertEqual(metrics.qualityRating, .excellent)

        metrics.latencyMs = 100
        metrics.packetLossPercent = 2
        metrics.jitterMs = 30
        XCTAssertEqual(metrics.qualityRating, .good)

        metrics.latencyMs = 200
        metrics.packetLossPercent = 4
        metrics.jitterMs = 60
        XCTAssertEqual(metrics.qualityRating, .fair)

        metrics.latencyMs = 500
        metrics.packetLossPercent = 10
        XCTAssertEqual(metrics.qualityRating, .poor)
    }

    // MARK: - AudioUtils Tests

    func testDbConversion() {
        let db: Float = -20.0
        let linear = AudioUtils.dbToLinear(db)
        let backToDb = AudioUtils.linearToDb(linear)

        XCTAssertEqual(backToDb, db, accuracy: 0.01)
    }

    func testMelConversion() {
        let hz: Float = 1000.0
        let mel = AudioUtils.hzToMel(hz)
        let backToHz = AudioUtils.melToHz(mel)

        XCTAssertEqual(backToHz, hz, accuracy: 0.01)
    }

    // MARK: - Constants Tests

    func testAudioConstants() {
        XCTAssertEqual(Constants.Audio.defaultSampleRate, 48000)
        XCTAssertEqual(Constants.Audio.maxPitchShift, 12.0)
        XCTAssertEqual(Constants.Audio.minPitchShift, -12.0)
        XCTAssertGreaterThan(Constants.Audio.voiceEmbeddingDimension, 0)
    }
}
