import SwiftUI

struct DialerView: View {
    @EnvironmentObject var callVM: CallViewModel
    @EnvironmentObject var voiceLabVM: VoiceLabViewModel
    @State private var phoneNumber = ""
    @State private var showVoicePicker = false

    private let dialPad: [[DialButton]] = [
        [.init("1", sub: ""), .init("2", sub: "ABC"), .init("3", sub: "DEF")],
        [.init("4", sub: "GHI"), .init("5", sub: "JKL"), .init("6", sub: "MNO")],
        [.init("7", sub: "PQRS"), .init("8", sub: "TUV"), .init("9", sub: "WXYZ")],
        [.init("*", sub: ""), .init("0", sub: "+"), .init("#", sub: "")]
    ]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Phone number display
                numberDisplay

                Spacer(minLength: 16)

                // Selected voice indicator
                selectedVoiceCard

                // Dial pad
                dialPadGrid

                // Action buttons
                actionButtons
            }
            .padding(.bottom, 16)
            .background(Color(.systemBackground))
            .navigationTitle("VoiceClone")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showVoicePicker = true
                    } label: {
                        Image(systemName: "waveform.badge.plus")
                            .foregroundStyle(.cyan)
                    }
                }
            }
            .sheet(isPresented: $showVoicePicker) {
                VoicePickerSheet(selectedProfile: $callVM.selectedVoiceProfile)
            }
        }
    }

    // MARK: - Number Display

    private var numberDisplay: some View {
        VStack(spacing: 4) {
            Text(formattedNumber)
                .font(.system(size: phoneNumber.count > 10 ? 28 : 36, weight: .light, design: .monospaced))
                .foregroundStyle(.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .frame(height: 50)
                .padding(.horizontal, 32)

            if !phoneNumber.isEmpty {
                Text("Tap call to dial with voice effect")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.top, 24)
    }

    private var formattedNumber: String {
        if phoneNumber.isEmpty { return "Enter Number" }
        // Simple US phone number formatting
        let digits = phoneNumber
        if digits.count <= 3 { return digits }
        if digits.count <= 6 {
            return "(\(digits.prefix(3))) \(digits.dropFirst(3))"
        }
        let area = digits.prefix(3)
        let prefix = digits.dropFirst(3).prefix(3)
        let line = digits.dropFirst(6).prefix(4)
        return "(\(area)) \(prefix)-\(line)"
    }

    // MARK: - Voice Card

    private var selectedVoiceCard: some View {
        Button {
            showVoicePicker = true
        } label: {
            HStack(spacing: 12) {
                Image(systemName: callVM.selectedVoiceProfile?.iconName ?? "mic.fill")
                    .font(.title3)
                    .foregroundStyle(.cyan)
                    .frame(width: 36, height: 36)
                    .background(Color.cyan.opacity(0.15))
                    .clipShape(Circle())

                VStack(alignment: .leading, spacing: 2) {
                    Text(callVM.selectedVoiceProfile?.name ?? "No Voice Effect")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)

                    Text(callVM.selectedVoiceProfile?.category.rawValue ?? "Original voice")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 16)
    }

    // MARK: - Dial Pad

    private var dialPadGrid: some View {
        VStack(spacing: 12) {
            ForEach(dialPad, id: \.self) { row in
                HStack(spacing: 20) {
                    ForEach(row) { button in
                        DialPadButton(button: button) {
                            withAnimation(.easeOut(duration: 0.1)) {
                                if phoneNumber.count < 15 {
                                    phoneNumber += button.digit
                                }
                            }
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 32)
    }

    // MARK: - Action Buttons

    private var actionButtons: some View {
        HStack(spacing: 40) {
            // Spacer for symmetry
            Color.clear.frame(width: 72, height: 72)

            // Call button
            Button {
                guard !phoneNumber.isEmpty else { return }
                callVM.startCall(to: phoneNumber)
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            } label: {
                Image(systemName: "phone.fill")
                    .font(.title)
                    .foregroundStyle(.white)
                    .frame(width: 72, height: 72)
                    .background(
                        phoneNumber.isEmpty
                            ? Color.gray.opacity(0.5)
                            : Color.green
                    )
                    .clipShape(Circle())
            }
            .disabled(phoneNumber.isEmpty)

            // Delete button
            Button {
                if !phoneNumber.isEmpty {
                    phoneNumber.removeLast()
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                }
            } label: {
                Image(systemName: "delete.backward.fill")
                    .font(.title2)
                    .foregroundStyle(.secondary)
                    .frame(width: 72, height: 72)
            }
            .opacity(phoneNumber.isEmpty ? 0 : 1)
        }
        .padding(.top, 16)
    }
}

// MARK: - Dial Button Model

struct DialButton: Identifiable, Hashable {
    let id = UUID()
    let digit: String
    let sub: String

    init(_ digit: String, sub: String) {
        self.digit = digit
        self.sub = sub
    }
}

// MARK: - Dial Pad Button

struct DialPadButton: View {
    let button: DialButton
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Text(button.digit)
                    .font(.system(size: 32, weight: .light))
                    .foregroundStyle(.primary)

                if !button.sub.isEmpty {
                    Text(button.sub)
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .tracking(2)
                }
            }
            .frame(width: 80, height: 80)
            .background(Color(.tertiarySystemBackground))
            .clipShape(Circle())
        }
    }
}

// MARK: - Voice Picker Sheet

struct VoicePickerSheet: View {
    @Binding var selectedProfile: VoiceProfile?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section("No Effect") {
                    Button {
                        selectedProfile = nil
                        dismiss()
                    } label: {
                        HStack {
                            Image(systemName: "mic.fill")
                                .foregroundStyle(.gray)
                            Text("Original Voice")
                                .foregroundStyle(.primary)
                            Spacer()
                            if selectedProfile == nil {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(.cyan)
                            }
                        }
                    }
                }

                Section("Presets") {
                    ForEach(VoiceProfile.presets) { profile in
                        Button {
                            selectedProfile = profile
                            dismiss()
                        } label: {
                            HStack {
                                Image(systemName: profile.iconName)
                                    .foregroundStyle(.cyan)
                                    .frame(width: 28)
                                VStack(alignment: .leading) {
                                    Text(profile.name)
                                        .foregroundStyle(.primary)
                                    Text(profile.category.rawValue)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                if selectedProfile?.id == profile.id {
                                    Image(systemName: "checkmark")
                                        .foregroundStyle(.cyan)
                                }
                            }
                        }
                    }
                }

                Section("Custom Voices") {
                    let store = VoiceProfileStore.shared
                    ForEach(store.profiles) { profile in
                        Button {
                            selectedProfile = profile
                            dismiss()
                        } label: {
                            HStack {
                                Image(systemName: profile.iconName)
                                    .foregroundStyle(.purple)
                                    .frame(width: 28)
                                VStack(alignment: .leading) {
                                    Text(profile.name)
                                        .foregroundStyle(.primary)
                                    if profile.isClonedVoice {
                                        Text("Cloned Voice")
                                            .font(.caption)
                                            .foregroundStyle(.purple)
                                    }
                                }
                                Spacer()
                                if selectedProfile?.id == profile.id {
                                    Image(systemName: "checkmark")
                                        .foregroundStyle(.cyan)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Select Voice")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
