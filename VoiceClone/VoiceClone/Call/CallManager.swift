import Foundation
import CallKit
import AVFoundation
import Combine

/// Manages phone calls via CallKit and coordinates with the VoIP service and audio engine.
final class CallManager: NSObject, ObservableObject {
    static let shared = CallManager()

    // MARK: - Published State

    @Published var activeCall: CallSession?
    @Published var callHistory: [CallSession] = []
    @Published var isCallActive: Bool = false

    // MARK: - CallKit

    let provider: CXProvider
    private let callController = CXCallController()

    // MARK: - Services

    private let voipService = VoIPService.shared
    private let audioEngine = AudioEngine.shared
    private var cancellables = Set<AnyCancellable>()

    private override init() {
        let config = CXProviderConfiguration()
        config.localizedName = "VoiceClone"
        config.supportsVideo = false
        config.maximumCallsPerCallGroup = 1
        config.maximumCallGroups = 1
        config.supportedHandleTypes = [.phoneNumber, .generic]
        config.includesCallsInRecents = true

        // Custom ringtone
        config.ringtoneSound = "ringtone.caf"

        // App icon for CallKit UI
        if let iconImage = UIImage(named: "AppIcon") {
            config.iconTemplateImageData = iconImage.pngData()
        }

        provider = CXProvider(configuration: config)
        super.init()
        provider.setDelegate(self, queue: DispatchQueue.main)
    }

    // MARK: - Outgoing Calls

    func startCall(to handle: String, voiceProfile: VoiceProfile?) {
        let uuid = UUID()
        let cxHandle = CXHandle(type: .generic, value: handle)

        let startAction = CXStartCallAction(call: uuid, handle: cxHandle)
        startAction.isVideo = false

        let transaction = CXTransaction(action: startAction)
        callController.request(transaction) { [weak self] error in
            if let error = error {
                print("[CallManager] Start call failed: \(error.localizedDescription)")
                return
            }

            var session = CallSession(
                id: uuid,
                handle: handle,
                direction: .outgoing,
                state: .connecting,
                voiceProfile: voiceProfile
            )
            session.startTime = Date()

            DispatchQueue.main.async {
                self?.activeCall = session
                self?.isCallActive = true
            }

            // Connect via VoIP
            self?.voipService.connect(callId: uuid.uuidString, to: handle)
            self?.audioEngine.applyProfile(voiceProfile)
            try? self?.audioEngine.start()

            // Route processed audio to VoIP
            self?.audioEngine.onProcessedAudio = { [weak self] buffer in
                self?.voipService.sendAudio(buffer)
            }
        }
    }

    // MARK: - Incoming Calls

    func addIncomingCall(uuid: UUID, handle: String) {
        let session = CallSession(
            id: uuid,
            handle: handle,
            direction: .incoming,
            state: .ringing
        )

        DispatchQueue.main.async {
            self.activeCall = session
        }
    }

    func answerCall(uuid: UUID, voiceProfile: VoiceProfile?) {
        let answerAction = CXAnswerCallAction(call: uuid)
        let transaction = CXTransaction(action: answerAction)

        callController.request(transaction) { [weak self] error in
            if let error = error {
                print("[CallManager] Answer call failed: \(error.localizedDescription)")
                return
            }

            DispatchQueue.main.async {
                self?.activeCall?.state = .active
                self?.activeCall?.startTime = Date()
                self?.activeCall?.voiceProfile = voiceProfile
                self?.isCallActive = true
            }

            self?.audioEngine.applyProfile(voiceProfile)
            try? self?.audioEngine.start()

            self?.audioEngine.onProcessedAudio = { [weak self] buffer in
                self?.voipService.sendAudio(buffer)
            }
        }
    }

    // MARK: - Call Actions

    func endCall() {
        guard let call = activeCall else { return }

        let endAction = CXEndCallAction(call: call.id)
        let transaction = CXTransaction(action: endAction)

        callController.request(transaction) { [weak self] error in
            if let error = error {
                print("[CallManager] End call failed: \(error.localizedDescription)")
            }
            self?.cleanupCall()
        }
    }

    func toggleMute() {
        guard let call = activeCall else { return }
        let newMuteState = !call.isMuted

        let muteAction = CXSetMutedCallAction(call: call.id, muted: newMuteState)
        let transaction = CXTransaction(action: muteAction)

        callController.request(transaction) { [weak self] error in
            if error == nil {
                DispatchQueue.main.async {
                    self?.activeCall?.isMuted = newMuteState
                }
            }
        }
    }

    func toggleHold() {
        guard let call = activeCall else { return }
        let newHoldState = !call.isOnHold

        let holdAction = CXSetHeldCallAction(call: call.id, onHold: newHoldState)
        let transaction = CXTransaction(action: holdAction)

        callController.request(transaction) { [weak self] error in
            if error == nil {
                DispatchQueue.main.async {
                    self?.activeCall?.isOnHold = newHoldState
                    self?.activeCall?.state = newHoldState ? .onHold : .active
                }
            }
        }
    }

    func toggleVoiceEffect() {
        guard activeCall != nil else { return }
        let newState = !(activeCall?.isVoiceEffectActive ?? false)

        DispatchQueue.main.async {
            self.activeCall?.isVoiceEffectActive = newState
        }

        if newState {
            audioEngine.applyProfile(activeCall?.voiceProfile)
        } else {
            audioEngine.applyProfile(nil)
        }
    }

    func switchVoiceProfile(_ profile: VoiceProfile) {
        DispatchQueue.main.async {
            self.activeCall?.voiceProfile = profile
        }
        audioEngine.applyProfile(profile)
    }

    // MARK: - Cleanup

    private func cleanupCall() {
        audioEngine.onProcessedAudio = nil
        audioEngine.stop()
        voipService.disconnect()

        DispatchQueue.main.async {
            if var call = self.activeCall {
                call.state = .ended
                call.endTime = Date()
                self.callHistory.insert(call, at: 0)
            }
            self.activeCall = nil
            self.isCallActive = false
        }
    }
}

// MARK: - CXProviderDelegate

extension CallManager: CXProviderDelegate {
    func providerDidReset(_ provider: CXProvider) {
        cleanupCall()
    }

    func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
        // Configure audio session for outgoing call
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth])
            try session.setActive(true)
        } catch {
            print("[CallKit] Audio session error: \(error.localizedDescription)")
            action.fail()
            return
        }

        // Update CallKit UI
        provider.reportOutgoingCall(with: action.callUUID, startedConnectingAt: Date())

        // Simulate connection (in production, wait for VoIP connection)
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            provider.reportOutgoingCall(with: action.callUUID, connectedAt: Date())

            DispatchQueue.main.async {
                self.activeCall?.state = .active
            }
        }

        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth])
            try session.setActive(true)
        } catch {
            print("[CallKit] Audio session error: \(error.localizedDescription)")
            action.fail()
            return
        }

        DispatchQueue.main.async {
            self.activeCall?.state = .active
            self.activeCall?.startTime = Date()
            self.isCallActive = true
        }

        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        cleanupCall()
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        DispatchQueue.main.async {
            self.activeCall?.isMuted = action.isMuted
        }
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXSetHeldCallAction) {
        DispatchQueue.main.async {
            self.activeCall?.isOnHold = action.isOnHold
        }
        action.fulfill()
    }

    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        print("[CallKit] Audio session activated")
        try? audioEngine.start()
    }

    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        print("[CallKit] Audio session deactivated")
        audioEngine.stop()
    }
}
