import SwiftUI

struct ActiveCallView: View {
    @EnvironmentObject var callVM: CallViewModel
    @EnvironmentObject var audioEngineVM: AudioEngineViewModel
    @State private var showVoiceSwitcher = false
    @State private var elapsedTime: TimeInterval = 0
    @State private var timer: Timer?

    var body: some View {
        ZStack {
            // Background gradient
            LinearGradient(
                colors: [Color(.systemBackground), Color.cyan.opacity(0.08)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                // Top bar
                topBar

                Spacer()

                // Call info
                callInfoSection

                Spacer()

                // Audio visualization
                audioVisualization

                Spacer()

                // Voice effect controls
                voiceEffectBar

                // Call action buttons
                callActionGrid

                // End call button
                endCallButton
                    .padding(.bottom, 48)
            }
        }
        .onAppear { startTimer() }
        .onDisappear { stopTimer() }
        .sheet(isPresented: $showVoiceSwitcher) {
            VoicePickerSheet(selectedProfile: $callVM.selectedVoiceProfile)
        }
    }

    // MARK: - Top Bar

    private var topBar: some View {
        HStack {
            // Quality indicator
            qualityBadge

            Spacer()

            // Latency indicator
            if audioEngineVM.currentLatencyMs > 0 {
                Text("\(Int(audioEngineVM.currentLatencyMs))ms")
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color(.tertiarySystemBackground))
                    .clipShape(Capsule())
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
    }

    private var qualityBadge: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(qualityColor)
                .frame(width: 8, height: 8)
            Text(callVM.callState.rawValue.capitalized)
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Color(.tertiarySystemBackground))
        .clipShape(Capsule())
    }

    private var qualityColor: Color {
        switch callVM.callState {
        case .active: return .green
        case .connecting: return .orange
        case .onHold: return .yellow
        default: return .gray
        }
    }

    // MARK: - Call Info

    private var callInfoSection: some View {
        VStack(spacing: 12) {
            // Avatar
            ZStack {
                Circle()
                    .fill(Color.cyan.opacity(0.15))
                    .frame(width: 100, height: 100)

                Image(systemName: "person.fill")
                    .font(.system(size: 42))
                    .foregroundStyle(.cyan)
            }

            // Name/Number
            Text(callVM.activeHandle)
                .font(.title.weight(.semibold))
                .foregroundStyle(.primary)

            // Duration
            Text(formattedElapsedTime)
                .font(.title3.monospaced())
                .foregroundStyle(.secondary)
        }
    }

    private var formattedElapsedTime: String {
        let minutes = Int(elapsedTime) / 60
        let seconds = Int(elapsedTime) % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }

    // MARK: - Audio Visualization

    private var audioVisualization: some View {
        VStack(spacing: 8) {
            WaveformView(
                inputLevel: audioEngineVM.inputLevel,
                outputLevel: audioEngineVM.outputLevel
            )
            .frame(height: 60)
            .padding(.horizontal, 32)

            HStack {
                Label("In", systemImage: "mic.fill")
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                VoiceMeterView(level: audioEngineVM.inputLevel)
                    .frame(height: 4)

                Spacer(minLength: 16)

                Label("Out", systemImage: "speaker.wave.2.fill")
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                VoiceMeterView(level: audioEngineVM.outputLevel, color: .cyan)
                    .frame(height: 4)
            }
            .padding(.horizontal, 32)
        }
    }

    // MARK: - Voice Effect Bar

    private var voiceEffectBar: some View {
        Button {
            showVoiceSwitcher = true
        } label: {
            HStack(spacing: 10) {
                Image(systemName: callVM.selectedVoiceProfile?.iconName ?? "mic.fill")
                    .foregroundStyle(.cyan)

                Text(callVM.selectedVoiceProfile?.name ?? "No Effect")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.primary)

                Spacer()

                Toggle("", isOn: Binding(
                    get: { callVM.isVoiceEffectActive },
                    set: { _ in callVM.toggleVoiceEffect() }
                ))
                .labelsHidden()
                .tint(.cyan)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 20)
    }

    // MARK: - Action Grid

    private var callActionGrid: some View {
        HStack(spacing: 36) {
            CallActionButton(
                icon: callVM.isMuted ? "mic.slash.fill" : "mic.fill",
                label: "Mute",
                isActive: callVM.isMuted
            ) {
                callVM.toggleMute()
            }

            CallActionButton(
                icon: "speaker.wave.2.fill",
                label: "Speaker",
                isActive: false
            ) {
                // Toggle speaker
            }

            CallActionButton(
                icon: "pause.fill",
                label: "Hold",
                isActive: callVM.isOnHold
            ) {
                callVM.toggleHold()
            }

            CallActionButton(
                icon: "waveform",
                label: "Voice",
                isActive: callVM.isVoiceEffectActive
            ) {
                showVoiceSwitcher = true
            }
        }
        .padding(.bottom, 28)
    }

    // MARK: - End Call

    private var endCallButton: some View {
        Button {
            UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
            callVM.endCall()
        } label: {
            Image(systemName: "phone.down.fill")
                .font(.title)
                .foregroundStyle(.white)
                .frame(width: 72, height: 72)
                .background(Color.red)
                .clipShape(Circle())
                .shadow(color: .red.opacity(0.4), radius: 8, y: 4)
        }
    }

    // MARK: - Timer

    private func startTimer() {
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            elapsedTime += 1
        }
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }
}

// MARK: - Call Action Button

struct CallActionButton: View {
    let icon: String
    let label: String
    let isActive: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.title3)
                    .foregroundStyle(isActive ? .white : .primary)
                    .frame(width: 52, height: 52)
                    .background(isActive ? Color.cyan : Color(.tertiarySystemBackground))
                    .clipShape(Circle())

                Text(label)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
