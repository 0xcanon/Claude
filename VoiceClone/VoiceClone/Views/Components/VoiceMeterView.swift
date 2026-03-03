import SwiftUI

/// Horizontal level meter for audio input/output.
struct VoiceMeterView: View {
    let level: Float
    var color: Color = .green
    var segmentCount: Int = 20

    var body: some View {
        GeometryReader { geometry in
            HStack(spacing: 2) {
                ForEach(0..<segmentCount, id: \.self) { index in
                    RoundedRectangle(cornerRadius: 1)
                        .fill(segmentColor(for: index))
                        .frame(
                            width: max(2, (geometry.size.width - CGFloat(segmentCount - 1) * 2) / CGFloat(segmentCount))
                        )
                }
            }
        }
    }

    private func segmentColor(for index: Int) -> Color {
        let threshold = Float(index) / Float(segmentCount)
        let normalizedLevel = min(level * 4, 1.0) // Amplify for visibility

        if normalizedLevel >= threshold {
            // Gradient from green to yellow to red
            let position = Float(index) / Float(segmentCount)
            if position < 0.6 {
                return color
            } else if position < 0.8 {
                return .yellow
            } else {
                return .red
            }
        } else {
            return Color(.tertiarySystemFill)
        }
    }
}
