import SwiftUI

struct MainTabView: View {
    @EnvironmentObject var callVM: CallViewModel
    @State private var selectedTab = 0

    var body: some View {
        ZStack {
            TabView(selection: $selectedTab) {
                DialerView()
                    .tabItem {
                        Label("Calls", systemImage: "phone.fill")
                    }
                    .tag(0)

                VoiceLabView()
                    .tabItem {
                        Label("Voice Lab", systemImage: "waveform")
                    }
                    .tag(1)

                SettingsView()
                    .tabItem {
                        Label("Settings", systemImage: "gearshape.fill")
                    }
                    .tag(2)
            }
            .tint(.cyan)

            // Active call overlay
            if callVM.isCallActive {
                ActiveCallView()
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .zIndex(100)
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: callVM.isCallActive)
    }
}
