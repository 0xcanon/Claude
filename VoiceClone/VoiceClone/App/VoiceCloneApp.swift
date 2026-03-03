import SwiftUI
import PushKit
import CallKit

@main
struct VoiceCloneApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var audioEngineVM = AudioEngineViewModel()
    @StateObject private var callVM = CallViewModel()
    @StateObject private var voiceLabVM = VoiceLabViewModel()

    var body: some Scene {
        WindowGroup {
            MainTabView()
                .environmentObject(audioEngineVM)
                .environmentObject(callVM)
                .environmentObject(voiceLabVM)
                .preferredColorScheme(.dark)
                .onAppear {
                    audioEngineVM.initialize()
                }
        }
    }
}
