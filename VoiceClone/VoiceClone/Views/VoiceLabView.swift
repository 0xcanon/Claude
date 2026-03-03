import SwiftUI

struct VoiceLabView: View {
    @EnvironmentObject var voiceLabVM: VoiceLabViewModel
    @EnvironmentObject var audioEngineVM: AudioEngineViewModel
    @State private var showCreateSheet = false
    @State private var showCloneSheet = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    // Live preview section
                    livePreviewCard

                    // Voice cloning section
                    cloneSection

                    // Preset voices
                    presetsSection

                    // Custom voices
                    customVoicesSection
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 32)
            }
            .background(Color(.systemBackground))
            .navigationTitle("Voice Lab")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showCreateSheet = true
                    } label: {
                        Image(systemName: "plus")
                            .foregroundStyle(.cyan)
                    }
                }
            }
            .sheet(isPresented: $showCreateSheet) {
                CreateVoiceSheet()
            }
            .sheet(isPresented: $showCloneSheet) {
                VoiceCloneSheet()
            }
        }
    }

    // MARK: - Live Preview

    private var livePreviewCard: some View {
        VStack(spacing: 16) {
            HStack {
                Text("Live Preview")
                    .font(.headline)
                Spacer()

                Button {
                    if voiceLabVM.isPreviewing {
                        voiceLabVM.stopPreview()
                    } else {
                        voiceLabVM.startPreview()
                    }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: voiceLabVM.isPreviewing ? "stop.fill" : "play.fill")
                        Text(voiceLabVM.isPreviewing ? "Stop" : "Start")
                    }
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(voiceLabVM.isPreviewing ? Color.red : Color.cyan)
                    .clipShape(Capsule())
                }
            }

            if voiceLabVM.isPreviewing {
                WaveformView(
                    inputLevel: audioEngineVM.inputLevel,
                    outputLevel: audioEngineVM.outputLevel
                )
                .frame(height: 50)

                HStack {
                    VoiceMeterView(level: audioEngineVM.inputLevel)
                        .frame(height: 6)
                    Text("In")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text("Out")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    VoiceMeterView(level: audioEngineVM.outputLevel, color: .cyan)
                        .frame(height: 6)
                }
            }

            // Quick controls when previewing
            if voiceLabVM.isPreviewing, let profile = voiceLabVM.previewProfile {
                VStack(spacing: 12) {
                    PitchControlView(
                        label: "Pitch",
                        value: Binding(
                            get: { profile.pitchShift },
                            set: { voiceLabVM.updatePreviewPitch($0) }
                        ),
                        range: -12...12,
                        unit: "st"
                    )

                    PitchControlView(
                        label: "Formant",
                        value: Binding(
                            get: { profile.formantShift },
                            set: { voiceLabVM.updatePreviewFormant($0) }
                        ),
                        range: 0.5...2.0,
                        unit: "x"
                    )
                }
            }
        }
        .padding(16)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Voice Cloning

    private var cloneSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Voice Cloning")
                .font(.headline)

            Button {
                showCloneSheet = true
            } label: {
                HStack(spacing: 12) {
                    ZStack {
                        Circle()
                            .fill(Color.purple.opacity(0.15))
                            .frame(width: 48, height: 48)
                        Image(systemName: "person.wave.2.fill")
                            .font(.title3)
                            .foregroundStyle(.purple)
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        Text("Clone a Voice")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.primary)
                        Text("Record 30s of speech to create a voice clone")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
                .padding(16)
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
    }

    // MARK: - Presets

    private var presetsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Presets")
                .font(.headline)

            LazyVGrid(columns: [
                GridItem(.flexible()),
                GridItem(.flexible())
            ], spacing: 12) {
                ForEach(VoiceProfile.presets) { profile in
                    VoiceProfileCard(
                        profile: profile,
                        isSelected: voiceLabVM.previewProfile?.id == profile.id,
                        onTap: {
                            voiceLabVM.selectPreviewProfile(profile)
                        }
                    )
                }
            }
        }
    }

    // MARK: - Custom Voices

    private var customVoicesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("My Voices")
                    .font(.headline)
                Spacer()
                Text("\(VoiceProfileStore.shared.profiles.count)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            if VoiceProfileStore.shared.profiles.isEmpty {
                emptyCustomVoicesView
            } else {
                ForEach(VoiceProfileStore.shared.profiles) { profile in
                    VoiceProfileRow(profile: profile) {
                        voiceLabVM.selectPreviewProfile(profile)
                    }
                }
            }
        }
    }

    private var emptyCustomVoicesView: some View {
        VStack(spacing: 8) {
            Image(systemName: "waveform.badge.plus")
                .font(.title)
                .foregroundStyle(.tertiary)
            Text("No custom voices yet")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text("Create one with the + button")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: - Voice Profile Card

struct VoiceProfileCard: View {
    let profile: VoiceProfile
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 10) {
                Image(systemName: profile.iconName)
                    .font(.title2)
                    .foregroundStyle(isSelected ? .white : .cyan)
                    .frame(width: 44, height: 44)
                    .background(isSelected ? Color.cyan : Color.cyan.opacity(0.12))
                    .clipShape(Circle())

                Text(profile.name)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.primary)
                    .lineLimit(1)

                Text(profile.category.rawValue)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(isSelected
                ? Color.cyan.opacity(0.08)
                : Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(isSelected ? Color.cyan : Color.clear, lineWidth: 1.5)
            )
        }
    }
}

// MARK: - Create Voice Sheet

struct CreateVoiceSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var pitchShift: Float = 0
    @State private var formantShift: Float = 1.0
    @State private var reverbMix: Float = 0
    @State private var selectedCategory: VoiceProfile.Category = .custom

    var body: some View {
        NavigationStack {
            Form {
                Section("Voice Name") {
                    TextField("My Voice", text: $name)
                }

                Section("Category") {
                    Picker("Category", selection: $selectedCategory) {
                        ForEach(VoiceProfile.Category.allCases, id: \.self) { category in
                            Text(category.rawValue).tag(category)
                        }
                    }
                }

                Section("Pitch") {
                    PitchControlView(
                        label: "Pitch Shift",
                        value: $pitchShift,
                        range: -12...12,
                        unit: "st"
                    )
                }

                Section("Formant") {
                    PitchControlView(
                        label: "Formant Ratio",
                        value: $formantShift,
                        range: 0.5...2.0,
                        unit: "x"
                    )
                }

                Section("Reverb") {
                    PitchControlView(
                        label: "Reverb Mix",
                        value: $reverbMix,
                        range: 0...1.0,
                        unit: ""
                    )
                }
            }
            .navigationTitle("New Voice")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") {
                        let profile = VoiceProfile(
                            name: name.isEmpty ? "Untitled" : name,
                            category: selectedCategory,
                            pitchShift: pitchShift,
                            formantShift: formantShift,
                            reverbMix: reverbMix
                        )
                        VoiceProfileStore.shared.save(profile)
                        dismiss()
                    }
                }
            }
        }
    }
}

// MARK: - Voice Clone Sheet

struct VoiceCloneSheet: View {
    @EnvironmentObject var voiceLabVM: VoiceLabViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var cloneName = ""
    @State private var recordingProgress: Double = 0
    @State private var isRecording = false
    @State private var isProcessing = false
    @State private var isComplete = false

    private let requiredDuration: Double = 30 // seconds

    var body: some View {
        NavigationStack {
            VStack(spacing: 32) {
                Spacer()

                // Status icon
                ZStack {
                    Circle()
                        .fill(statusColor.opacity(0.15))
                        .frame(width: 120, height: 120)

                    if isProcessing {
                        ProgressView()
                            .scaleEffect(1.5)
                    } else {
                        Image(systemName: statusIcon)
                            .font(.system(size: 48))
                            .foregroundStyle(statusColor)
                    }
                }

                // Instructions
                VStack(spacing: 8) {
                    Text(statusTitle)
                        .font(.title2.weight(.semibold))

                    Text(statusDescription)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }

                // Progress bar
                if isRecording {
                    VStack(spacing: 8) {
                        ProgressView(value: recordingProgress)
                            .tint(.purple)
                            .padding(.horizontal, 48)

                        Text("\(Int(recordingProgress * requiredDuration))s / \(Int(requiredDuration))s")
                            .font(.caption.monospaced())
                            .foregroundStyle(.secondary)
                    }
                }

                if isComplete {
                    TextField("Voice Name", text: $cloneName)
                        .textFieldStyle(.roundedBorder)
                        .padding(.horizontal, 48)
                }

                Spacer()

                // Action button
                if !isProcessing {
                    Button {
                        if isComplete {
                            saveClone()
                        } else if isRecording {
                            stopRecording()
                        } else {
                            startRecording()
                        }
                    } label: {
                        Text(actionButtonTitle)
                            .font(.headline)
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                            .background(isRecording ? Color.red : Color.purple)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                    .padding(.horizontal, 24)
                }
            }
            .padding(.bottom, 32)
            .navigationTitle("Clone Voice")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private var statusColor: Color {
        if isComplete { return .green }
        if isRecording { return .red }
        return .purple
    }

    private var statusIcon: String {
        if isComplete { return "checkmark.circle.fill" }
        if isRecording { return "waveform" }
        return "person.wave.2.fill"
    }

    private var statusTitle: String {
        if isComplete { return "Voice Cloned!" }
        if isProcessing { return "Processing..." }
        if isRecording { return "Recording..." }
        return "Clone a Voice"
    }

    private var statusDescription: String {
        if isComplete { return "Your voice clone is ready to use." }
        if isProcessing { return "Analyzing voice characteristics and building model." }
        if isRecording { return "Read the text aloud clearly. Ensure minimal background noise." }
        return "Record at least 30 seconds of clear speech to create a high-quality voice clone."
    }

    private var actionButtonTitle: String {
        if isComplete { return "Save Voice" }
        if isRecording { return "Stop Recording" }
        return "Start Recording"
    }

    private func startRecording() {
        isRecording = true
        voiceLabVM.startCloneRecording()

        // Simulate recording progress
        Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { timer in
            recordingProgress += 0.1 / requiredDuration
            if recordingProgress >= 1.0 {
                timer.invalidate()
                stopRecording()
            }
        }
    }

    private func stopRecording() {
        isRecording = false
        isProcessing = true
        voiceLabVM.stopCloneRecording()

        // Process the recording
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
            isProcessing = false
            isComplete = true
        }
    }

    private func saveClone() {
        let name = cloneName.isEmpty ? "Cloned Voice" : cloneName
        voiceLabVM.saveClonedVoice(name: name)
        dismiss()
    }
}
