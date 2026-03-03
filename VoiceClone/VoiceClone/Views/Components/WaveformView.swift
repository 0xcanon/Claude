import SwiftUI

/// Animated waveform visualization showing input and output audio levels.
struct WaveformView: View {
    let inputLevel: Float
    let outputLevel: Float
    let barCount: Int = 40

    @State private var barHeights: [CGFloat] = []
    @State private var timer: Timer?

    var body: some View {
        GeometryReader { geometry in
            HStack(spacing: 2) {
                ForEach(0..<barCount, id: \.self) { index in
                    RoundedRectangle(cornerRadius: 1.5)
                        .fill(barGradient(for: index))
                        .frame(
                            width: max(2, (geometry.size.width - CGFloat(barCount - 1) * 2) / CGFloat(barCount)),
                            height: max(3, barHeight(for: index, maxHeight: geometry.size.height))
                        )
                        .animation(
                            .spring(response: 0.15, dampingFraction: 0.6),
                            value: barHeights.isEmpty ? 0 : barHeights[min(index, barHeights.count - 1)]
                        )
                }
            }
            .frame(maxHeight: .infinity, alignment: .center)
            .onAppear {
                barHeights = Array(repeating: 3, count: barCount)
                startAnimation()
            }
            .onDisappear {
                timer?.invalidate()
            }
        }
    }

    private func barGradient(for index: Int) -> LinearGradient {
        let position = CGFloat(index) / CGFloat(barCount)
        let isCenter = abs(position - 0.5) < 0.15

        if isCenter {
            return LinearGradient(
                colors: [.cyan, .cyan.opacity(0.8)],
                startPoint: .bottom,
                endPoint: .top
            )
        } else {
            return LinearGradient(
                colors: [.cyan.opacity(0.4), .cyan.opacity(0.2)],
                startPoint: .bottom,
                endPoint: .top
            )
        }
    }

    private func barHeight(for index: Int, maxHeight: CGFloat) -> CGFloat {
        guard !barHeights.isEmpty, index < barHeights.count else { return 3 }
        return barHeights[index]
    }

    private func startAnimation() {
        timer = Timer.scheduledTimer(withTimeInterval: 1.0 / 30.0, repeats: true) { _ in
            updateBars()
        }
    }

    private func updateBars() {
        let avgLevel = (inputLevel + outputLevel) / 2.0
        let normalizedLevel = CGFloat(min(avgLevel * 5, 1.0))

        var newHeights = [CGFloat](repeating: 0, count: barCount)
        for i in 0..<barCount {
            let position = CGFloat(i) / CGFloat(barCount)
            let centerDistance = abs(position - 0.5) * 2

            // Base height influenced by audio level
            let baseHeight = (1.0 - centerDistance * 0.7) * normalizedLevel

            // Add some randomness for organic feel
            let noise = CGFloat.random(in: -0.1...0.1)

            // Frequency-dependent variation
            let freqComponent = sin(CGFloat(i) * 0.5 + CGFloat(Date().timeIntervalSince1970) * 8) * 0.2

            let height = max(0.05, baseHeight + noise + freqComponent * normalizedLevel)
            newHeights[i] = height * 50 + 3 // Scale to pixels
        }

        withAnimation(.easeOut(duration: 0.05)) {
            barHeights = newHeights
        }
    }
}
