import AVFoundation
import Accelerate

/// Real-time pitch shifter using phase vocoder (STFT overlap-add).
/// Provides high-quality pitch shifting without changing tempo.
final class PitchShifter {
    // MARK: - Configuration

    var pitchShiftSemitones: Float = 0 {
        didSet { pitchRatio = powf(2.0, pitchShiftSemitones / 12.0) }
    }

    private(set) var pitchRatio: Float = 1.0

    private var fftSize: Int = 2048
    private var hopSize: Int = 512
    private var overlapCount: Int { fftSize / hopSize }

    // MARK: - FFT State

    private var fftSetup: vDSP_DFT_Setup?
    private var window: [Float] = []

    // Analysis buffers
    private var analysisBuffer: [Float] = []
    private var analysisMagnitudes: [Float] = []
    private var analysisPhases: [Float] = []
    private var previousAnalysisPhases: [Float] = []

    // Synthesis buffers
    private var synthesisBuffer: [Float] = []
    private var synthesisMagnitudes: [Float] = []
    private var synthesisPhases: [Float] = []
    private var previousSynthesisPhases: [Float] = []

    // Overlap-add output
    private var outputAccumulator: [Float] = []
    private var inputFIFO: [Float] = []
    private var outputFIFO: [Float] = []
    private var fifoWritePointer: Int = 0

    // Temp buffers for FFT
    private var realPart: [Float] = []
    private var imagPart: [Float] = []

    private var isConfigured = false

    // MARK: - Setup

    func configure(fftSize: Int, hopSize: Int) {
        self.fftSize = fftSize
        self.hopSize = hopSize

        let halfFFT = fftSize / 2 + 1

        fftSetup = vDSP_DFT_zop_CreateSetup(nil, vDSP_Length(fftSize), .FORWARD)

        // Hann window
        window = [Float](repeating: 0, count: fftSize)
        vDSP_hann_window(&window, vDSP_Length(fftSize), Int32(vDSP_HANN_NORM))

        // Allocate buffers
        analysisBuffer = [Float](repeating: 0, count: fftSize)
        analysisMagnitudes = [Float](repeating: 0, count: halfFFT)
        analysisPhases = [Float](repeating: 0, count: halfFFT)
        previousAnalysisPhases = [Float](repeating: 0, count: halfFFT)

        synthesisBuffer = [Float](repeating: 0, count: fftSize)
        synthesisMagnitudes = [Float](repeating: 0, count: halfFFT)
        synthesisPhases = [Float](repeating: 0, count: halfFFT)
        previousSynthesisPhases = [Float](repeating: 0, count: halfFFT)

        outputAccumulator = [Float](repeating: 0, count: fftSize * 2)
        inputFIFO = [Float](repeating: 0, count: fftSize)
        outputFIFO = [Float](repeating: 0, count: fftSize)
        fifoWritePointer = fftSize - hopSize

        realPart = [Float](repeating: 0, count: fftSize)
        imagPart = [Float](repeating: 0, count: fftSize)

        isConfigured = true
    }

    func reset() {
        pitchShiftSemitones = 0
        if isConfigured {
            outputAccumulator = [Float](repeating: 0, count: fftSize * 2)
            inputFIFO = [Float](repeating: 0, count: fftSize)
            outputFIFO = [Float](repeating: 0, count: fftSize)
            previousAnalysisPhases = [Float](repeating: 0, count: fftSize / 2 + 1)
            previousSynthesisPhases = [Float](repeating: 0, count: fftSize / 2 + 1)
            fifoWritePointer = fftSize - hopSize
        }
    }

    // MARK: - Processing

    func process(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer {
        guard isConfigured, pitchRatio != 1.0,
              let channelData = buffer.floatChannelData?[0] else { return buffer }

        let frameCount = Int(buffer.frameLength)
        let outputBuffer = AVAudioPCMBuffer(
            pcmFormat: buffer.format,
            frameCapacity: buffer.frameCapacity
        )!
        outputBuffer.frameLength = buffer.frameLength
        let outputData = outputBuffer.floatChannelData![0]

        for i in 0..<frameCount {
            // Fill input FIFO
            inputFIFO[fifoWritePointer] = channelData[i]
            outputData[i] = outputFIFO[fifoWritePointer - (fftSize - hopSize)]
            fifoWritePointer += 1

            if fifoWritePointer >= fftSize {
                fifoWritePointer = fftSize - hopSize

                // Process one frame through phase vocoder
                processFrame()

                // Shift FIFOs
                let shiftCount = fftSize - hopSize
                memmove(&inputFIFO, inputFIFO.advanced(by: hopSize), shiftCount * MemoryLayout<Float>.size)
                memmove(&outputFIFO, outputAccumulator, fftSize * MemoryLayout<Float>.size)

                // Shift accumulator
                memmove(&outputAccumulator, outputAccumulator.advanced(by: hopSize), shiftCount * MemoryLayout<Float>.size)
                memset(&outputAccumulator[shiftCount], 0, hopSize * MemoryLayout<Float>.size)
            }
        }

        return outputBuffer
    }

    private func processFrame() {
        let halfFFT = fftSize / 2 + 1
        let freqPerBin = Float(48000) / Float(fftSize)
        let expectedPhaseDiff = 2.0 * Float.pi * Float(hopSize) / Float(fftSize)

        // Apply window to input
        vDSP_vmul(inputFIFO, 1, window, 1, &analysisBuffer, 1, vDSP_Length(fftSize))

        // Forward FFT
        forwardFFT(analysisBuffer, real: &realPart, imag: &imagPart)

        // Convert to magnitude and phase
        for k in 0..<halfFFT {
            let re = realPart[k]
            let im = imagPart[k]
            analysisMagnitudes[k] = sqrtf(re * re + im * im)
            analysisPhases[k] = atan2f(im, re)
        }

        // Phase vocoder pitch shifting
        // Clear synthesis bins
        memset(&synthesisMagnitudes, 0, halfFFT * MemoryLayout<Float>.size)
        memset(&synthesisPhases, 0, halfFFT * MemoryLayout<Float>.size)

        for k in 0..<halfFFT {
            // Calculate true frequency of this bin
            var phaseDiff = analysisPhases[k] - previousAnalysisPhases[k]
            previousAnalysisPhases[k] = analysisPhases[k]

            // Remove expected phase difference
            phaseDiff -= Float(k) * expectedPhaseDiff

            // Map to -pi..pi
            phaseDiff = phaseDiff - Float.pi * 2.0 * roundf(phaseDiff / (Float.pi * 2.0))

            // True frequency
            let trueFreq = Float(k) * freqPerBin + phaseDiff * freqPerBin / expectedPhaseDiff

            // Map to new bin
            let newBin = Int(Float(k) * pitchRatio)
            let newFreq = trueFreq * pitchRatio

            if newBin < halfFFT {
                synthesisMagnitudes[newBin] += analysisMagnitudes[k]

                // Calculate new phase
                let newPhaseDiff = (newFreq / freqPerBin - Float(newBin)) * expectedPhaseDiff
                    + Float(newBin) * expectedPhaseDiff
                synthesisPhases[newBin] = previousSynthesisPhases[newBin] + newPhaseDiff
            }
        }

        // Save synthesis phases
        memcpy(&previousSynthesisPhases, synthesisPhases, halfFFT * MemoryLayout<Float>.size)

        // Convert back to complex
        for k in 0..<halfFFT {
            realPart[k] = synthesisMagnitudes[k] * cosf(synthesisPhases[k])
            imagPart[k] = synthesisMagnitudes[k] * sinf(synthesisPhases[k])
        }

        // Inverse FFT
        inverseFFT(real: realPart, imag: imagPart, output: &synthesisBuffer)

        // Apply window and overlap-add
        vDSP_vmul(synthesisBuffer, 1, window, 1, &synthesisBuffer, 1, vDSP_Length(fftSize))

        // Normalize by overlap factor
        var normFactor = 1.0 / Float(overlapCount)
        vDSP_vsmul(synthesisBuffer, 1, &normFactor, &synthesisBuffer, 1, vDSP_Length(fftSize))

        // Add to output accumulator
        vDSP_vadd(outputAccumulator, 1, synthesisBuffer, 1, &outputAccumulator, 1, vDSP_Length(fftSize))
    }

    // MARK: - FFT Wrappers

    private func forwardFFT(_ input: [Float], real: inout [Float], imag: inout [Float]) {
        // Split into even/odd for DFT
        for i in 0..<fftSize {
            real[i] = input[i]
            imag[i] = 0
        }

        var inputReal = real
        var inputImag = imag

        if let setup = fftSetup {
            vDSP_DFT_Execute(setup, &inputReal, &inputImag, &real, &imag)
        }
    }

    private func inverseFFT(real: [Float], imag: [Float], output: inout [Float]) {
        guard let inverseSetup = vDSP_DFT_zop_CreateSetup(nil, vDSP_Length(fftSize), .INVERSE) else { return }
        defer { vDSP_DFT_DestroySetup(inverseSetup) }

        var outReal = [Float](repeating: 0, count: fftSize)
        var outImag = [Float](repeating: 0, count: fftSize)
        var inReal = real
        var inImag = imag

        vDSP_DFT_Execute(inverseSetup, &inReal, &inImag, &outReal, &outImag)

        // Normalize
        var scale = 1.0 / Float(fftSize)
        vDSP_vsmul(outReal, 1, &scale, &output, 1, vDSP_Length(fftSize))
    }
}
