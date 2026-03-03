import Foundation
import Combine

/// ViewModel managing call state and coordinating between UI and CallManager.
@MainActor
final class CallViewModel: ObservableObject {
    // MARK: - Published State

    @Published var isCallActive = false
    @Published var callState: CallSession.State = .idle
    @Published var activeHandle = ""
    @Published var callDuration: TimeInterval = 0
    @Published var isMuted = false
    @Published var isOnHold = false
    @Published var isVoiceEffectActive = true
    @Published var selectedVoiceProfile: VoiceProfile?
    @Published var callHistory: [CallSession] = []

    // MARK: - Private

    private let callManager = CallManager.shared
    private var cancellables = Set<AnyCancellable>()
    private var durationTimer: Timer?

    init() {
        observeCallManager()
    }

    private func observeCallManager() {
        callManager.$activeCall
            .receive(on: DispatchQueue.main)
            .sink { [weak self] call in
                self?.isCallActive = call != nil
                self?.callState = call?.state ?? .idle
                self?.activeHandle = call?.handle ?? ""
                self?.isMuted = call?.isMuted ?? false
                self?.isOnHold = call?.isOnHold ?? false
                self?.isVoiceEffectActive = call?.isVoiceEffectActive ?? true

                if call?.state == .active {
                    self?.startDurationTimer()
                } else {
                    self?.stopDurationTimer()
                }
            }
            .store(in: &cancellables)

        callManager.$callHistory
            .receive(on: DispatchQueue.main)
            .assign(to: &$callHistory)
    }

    // MARK: - Actions

    func startCall(to handle: String) {
        callManager.startCall(to: handle, voiceProfile: selectedVoiceProfile)
    }

    func endCall() {
        callManager.endCall()
        stopDurationTimer()
        callDuration = 0
    }

    func toggleMute() {
        callManager.toggleMute()
    }

    func toggleHold() {
        callManager.toggleHold()
    }

    func toggleVoiceEffect() {
        callManager.toggleVoiceEffect()
    }

    func switchVoiceProfile(_ profile: VoiceProfile) {
        selectedVoiceProfile = profile
        callManager.switchVoiceProfile(profile)
    }

    // MARK: - Duration Timer

    private func startDurationTimer() {
        stopDurationTimer()
        durationTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.callDuration += 1
            }
        }
    }

    private func stopDurationTimer() {
        durationTimer?.invalidate()
        durationTimer = nil
    }
}
