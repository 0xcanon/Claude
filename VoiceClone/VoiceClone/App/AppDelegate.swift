import UIKit
import PushKit
import CallKit
import AVFoundation

class AppDelegate: NSObject, UIApplicationDelegate {
    var voipRegistry: PKPushRegistry?
    private let callManager = CallManager.shared

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        configureAudioSession()
        registerForVoIPPush()
        return true
    }

    private func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(
                .playAndRecord,
                mode: .voiceChat,
                options: [.allowBluetooth, .defaultToSpeaker, .mixWithOthers]
            )
            try session.setPreferredSampleRate(48000)
            try session.setPreferredIOBufferDuration(0.005) // 5ms for low latency
            try session.setActive(true)
        } catch {
            print("[AppDelegate] Audio session configuration failed: \(error.localizedDescription)")
        }
    }

    private func registerForVoIPPush() {
        voipRegistry = PKPushRegistry(queue: DispatchQueue.main)
        voipRegistry?.delegate = self
        voipRegistry?.desiredPushTypes = [.voIP]
    }
}

// MARK: - PKPushRegistryDelegate

extension AppDelegate: PKPushRegistryDelegate {
    func pushRegistry(
        _ registry: PKPushRegistry,
        didUpdate pushCredentials: PKPushCredentials,
        for type: PKPushType
    ) {
        let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
        print("[VoIP] Push token: \(token)")
        APIClient.shared.registerPushToken(token)
    }

    func pushRegistry(
        _ registry: PKPushRegistry,
        didReceiveIncomingPushWith payload: PKPushPayload,
        for type: PKPushType,
        completion: @escaping () -> Void
    ) {
        guard type == .voIP else {
            completion()
            return
        }

        let callerName = payload.dictionaryPayload["caller_name"] as? String ?? "Unknown"
        let callId = payload.dictionaryPayload["call_id"] as? String ?? UUID().uuidString
        let hasVideo = payload.dictionaryPayload["has_video"] as? Bool ?? false

        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: callerName)
        update.hasVideo = hasVideo
        update.localizedCallerName = callerName

        let uuid = UUID(uuidString: callId) ?? UUID()
        callManager.provider.reportNewIncomingCall(with: uuid, update: update) { error in
            if let error = error {
                print("[VoIP] Failed to report incoming call: \(error.localizedDescription)")
            } else {
                self.callManager.addIncomingCall(uuid: uuid, handle: callerName)
            }
            completion()
        }
    }

    func pushRegistry(
        _ registry: PKPushRegistry,
        didInvalidatePushTokenFor type: PKPushType
    ) {
        print("[VoIP] Push token invalidated")
    }
}
