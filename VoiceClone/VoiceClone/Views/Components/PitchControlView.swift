import SwiftUI

/// Slider control for pitch, formant, and other audio parameters.
struct PitchControlView: View {
    let label: String
    @Binding var value: Float
    let range: ClosedRange<Float>
    let unit: String

    var body: some View {
        VStack(spacing: 6) {
            HStack {
                Text(label)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)

                Spacer()

                Text(formattedValue)
                    .font(.caption.monospaced().weight(.medium))
                    .foregroundStyle(.cyan)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Color.cyan.opacity(0.1))
                    .clipShape(Capsule())
            }

            HStack(spacing: 12) {
                // Decrease button
                Button {
                    let step = stepSize
                    value = max(range.lowerBound, value - step)
                } label: {
                    Image(systemName: "minus")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.secondary)
                        .frame(width: 28, height: 28)
                        .background(Color(.tertiarySystemBackground))
                        .clipShape(Circle())
                }

                // Slider
                Slider(value: $value, in: range)
                    .tint(.cyan)

                // Increase button
                Button {
                    let step = stepSize
                    value = min(range.upperBound, value + step)
                } label: {
                    Image(systemName: "plus")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.secondary)
                        .frame(width: 28, height: 28)
                        .background(Color(.tertiarySystemBackground))
                        .clipShape(Circle())
                }
            }
        }
    }

    private var formattedValue: String {
        if unit == "st" {
            return "\(value > 0 ? "+" : "")\(String(format: "%.1f", value))\(unit)"
        }
        return "\(String(format: "%.2f", value))\(unit)"
    }

    private var stepSize: Float {
        let rangeSize = range.upperBound - range.lowerBound
        return rangeSize / 24.0
    }
}
