import SwiftUI

struct VoiceProfileRow: View {
    let profile: VoiceProfile
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            HStack(spacing: 14) {
                // Icon
                Image(systemName: profile.iconName)
                    .font(.title3)
                    .foregroundStyle(profile.isClonedVoice ? .purple : .cyan)
                    .frame(width: 42, height: 42)
                    .background(
                        (profile.isClonedVoice ? Color.purple : Color.cyan).opacity(0.12)
                    )
                    .clipShape(Circle())

                // Info
                VStack(alignment: .leading, spacing: 3) {
                    Text(profile.name)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.primary)

                    HStack(spacing: 8) {
                        Text(profile.category.rawValue)
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        if profile.isClonedVoice {
                            Label("Cloned", systemImage: "person.wave.2")
                                .font(.caption2)
                                .foregroundStyle(.purple)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color.purple.opacity(0.1))
                                .clipShape(Capsule())
                        }
                    }
                }

                Spacer()

                // Quick info
                VStack(alignment: .trailing, spacing: 2) {
                    if profile.pitchShift != 0 {
                        Text("\(profile.pitchShift > 0 ? "+" : "")\(String(format: "%.0f", profile.pitchShift))st")
                            .font(.caption.monospaced())
                            .foregroundStyle(.cyan)
                    }
                    if profile.formantShift != 1.0 {
                        Text("\(String(format: "%.1f", profile.formantShift))x")
                            .font(.caption.monospaced())
                            .foregroundStyle(.orange)
                    }
                }

                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            .padding(14)
            .background(Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }
}
