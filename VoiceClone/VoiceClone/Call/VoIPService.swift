import Foundation
import AVFoundation
import Network

/// VoIP service for establishing and managing real-time audio calls.
/// Uses WebSocket for signaling and UDP for media transport.
final class VoIPService: ObservableObject {
    static let shared = VoIPService()

    // MARK: - State

    @Published var connectionState: ConnectionState = .disconnected
    @Published var qualityMetrics = AudioQualityMetrics()

    enum ConnectionState: String {
        case disconnected
        case connecting
        case connected
        case reconnecting
        case failed
    }

    // MARK: - Networking

    private var signalingSocket: WebSocketManager?
    private var mediaConnection: NWConnection?
    private let mediaQueue = DispatchQueue(
        label: "com.voiceclone.voip.media",
        qos: .userInteractive
    )

    // MARK: - Audio

    private let audioEncoder = OpusEncoder()
    private let audioDecoder = OpusDecoder()
    private var sequenceNumber: UInt16 = 0
    private var timestamp: UInt32 = 0
    private let ssrc: UInt32 = UInt32.random(in: 0..<UInt32.max)

    // MARK: - Jitter Buffer

    private var jitterBuffer: [UInt16: Data] = [:]
    private var playoutSequence: UInt16 = 0
    private let jitterBufferSize = 5 // packets
    private let jitterTimer = DispatchSource.makeTimerSource(queue: DispatchQueue(
        label: "com.voiceclone.voip.jitter",
        qos: .userInteractive
    ))

    // MARK: - Callbacks

    var onRemoteAudio: ((AVAudioPCMBuffer) -> Void)?

    // MARK: - Configuration

    private var serverHost: String {
        SettingsStore.shared.serverHost
    }
    private var serverPort: UInt16 {
        UInt16(SettingsStore.shared.serverPort)
    }

    private init() {}

    // MARK: - Connection

    func connect(callId: String, to handle: String) {
        connectionState = .connecting

        // 1. Connect signaling WebSocket
        let wsURL = "wss://\(serverHost)/ws/call"
        signalingSocket = WebSocketManager(url: wsURL)

        signalingSocket?.onMessage = { [weak self] message in
            self?.handleSignalingMessage(message)
        }

        signalingSocket?.onConnected = { [weak self] in
            // Send call setup message
            let setup: [String: Any] = [
                "type": "call_setup",
                "call_id": callId,
                "target": handle,
                "codec": "opus",
                "sample_rate": 48000,
                "channels": 1,
                "ssrc": self?.ssrc ?? 0
            ]

            if let data = try? JSONSerialization.data(withJSONObject: setup),
               let json = String(data: data, encoding: .utf8) {
                self?.signalingSocket?.send(json)
            }
        }

        signalingSocket?.connect()
    }

    func disconnect() {
        jitterTimer.cancel()
        mediaConnection?.cancel()
        signalingSocket?.disconnect()

        DispatchQueue.main.async {
            self.connectionState = .disconnected
        }

        sequenceNumber = 0
        timestamp = 0
        jitterBuffer.removeAll()
    }

    // MARK: - Signaling

    private func handleSignalingMessage(_ message: String) {
        guard let data = message.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = json["type"] as? String else { return }

        switch type {
        case "call_accepted":
            let mediaHost = json["media_host"] as? String ?? serverHost
            let mediaPort = json["media_port"] as? Int ?? 10000
            setupMediaConnection(host: mediaHost, port: UInt16(mediaPort))

        case "call_rejected":
            disconnect()

        case "call_ended":
            disconnect()

        case "ice_candidate":
            // Handle ICE candidate for NAT traversal
            break

        default:
            break
        }
    }

    // MARK: - Media Transport

    private func setupMediaConnection(host: String, port: UInt16) {
        let endpoint = NWEndpoint.hostPort(
            host: NWEndpoint.Host(host),
            port: NWEndpoint.Port(rawValue: port)!
        )

        let params = NWParameters.udp
        params.serviceClass = .interactiveVoice
        params.expiredDNSBehavior = .allow

        mediaConnection = NWConnection(to: endpoint, using: params)

        mediaConnection?.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready:
                DispatchQueue.main.async {
                    self?.connectionState = .connected
                }
                self?.startReceiving()
                self?.startJitterBufferPlayout()

            case .failed(let error):
                print("[VoIP] Media connection failed: \(error)")
                DispatchQueue.main.async {
                    self?.connectionState = .failed
                }

            default:
                break
            }
        }

        mediaConnection?.start(queue: mediaQueue)
    }

    // MARK: - Sending Audio

    func sendAudio(_ buffer: AVAudioPCMBuffer) {
        guard connectionState == .connected else { return }

        // Encode with Opus
        guard let encodedData = audioEncoder.encode(buffer) else { return }

        // Create RTP packet
        let rtpPacket = createRTPPacket(
            payload: encodedData,
            sequenceNumber: sequenceNumber,
            timestamp: timestamp,
            ssrc: ssrc
        )

        sequenceNumber &+= 1
        timestamp &+= UInt32(buffer.frameLength)

        // Send via UDP
        mediaConnection?.send(
            content: rtpPacket,
            completion: .contentProcessed { error in
                if let error = error {
                    print("[VoIP] Send error: \(error)")
                }
            }
        )
    }

    // MARK: - Receiving Audio

    private func startReceiving() {
        receiveNextPacket()
    }

    private func receiveNextPacket() {
        mediaConnection?.receive(minimumIncompleteLength: 1, maximumLength: 2048) { [weak self] data, _, _, error in
            if let data = data {
                self?.handleReceivedPacket(data)
            }
            if error == nil {
                self?.receiveNextPacket()
            }
        }
    }

    private func handleReceivedPacket(_ data: Data) {
        // Parse RTP header
        guard data.count > 12 else { return }
        let seqNum = UInt16(data[2]) << 8 | UInt16(data[3])
        let payload = data.subdata(in: 12..<data.count)

        // Add to jitter buffer
        jitterBuffer[seqNum] = payload

        // Update metrics
        DispatchQueue.main.async {
            self.qualityMetrics.jitterMs = self.calculateJitter()
        }
    }

    private func startJitterBufferPlayout() {
        jitterTimer.schedule(
            deadline: .now(),
            repeating: .milliseconds(20) // 20ms Opus frame
        )

        jitterTimer.setEventHandler { [weak self] in
            self?.playoutNextFrame()
        }

        jitterTimer.resume()
    }

    private func playoutNextFrame() {
        if let payload = jitterBuffer.removeValue(forKey: playoutSequence) {
            // Decode Opus to PCM
            if let pcmBuffer = audioDecoder.decode(payload) {
                onRemoteAudio?(pcmBuffer)
            }
        } else {
            // Packet loss — generate comfort noise or interpolate
            qualityMetrics.packetLossPercent += 0.1
        }
        playoutSequence &+= 1
    }

    // MARK: - RTP Packet Construction

    private func createRTPPacket(
        payload: Data,
        sequenceNumber: UInt16,
        timestamp: UInt32,
        ssrc: UInt32
    ) -> Data {
        var packet = Data(capacity: 12 + payload.count)

        // V=2, P=0, X=0, CC=0
        packet.append(0x80)
        // M=0, PT=111 (Opus)
        packet.append(111)
        // Sequence number
        packet.append(UInt8(sequenceNumber >> 8))
        packet.append(UInt8(sequenceNumber & 0xFF))
        // Timestamp
        packet.append(UInt8((timestamp >> 24) & 0xFF))
        packet.append(UInt8((timestamp >> 16) & 0xFF))
        packet.append(UInt8((timestamp >> 8) & 0xFF))
        packet.append(UInt8(timestamp & 0xFF))
        // SSRC
        packet.append(UInt8((ssrc >> 24) & 0xFF))
        packet.append(UInt8((ssrc >> 16) & 0xFF))
        packet.append(UInt8((ssrc >> 8) & 0xFF))
        packet.append(UInt8(ssrc & 0xFF))
        // Payload
        packet.append(payload)

        return packet
    }

    private func calculateJitter() -> Double {
        // Simplified jitter calculation
        return Double(jitterBuffer.count) * 20.0 / Double(jitterBufferSize)
    }
}

// MARK: - Opus Codec Wrappers

/// Opus audio encoder for VoIP transmission.
/// In production, link against libopus via a C bridging header.
final class OpusEncoder {
    private let frameSize = 960 // 20ms at 48kHz
    private let sampleRate: Int32 = 48000
    private let channels: Int32 = 1

    func encode(_ buffer: AVAudioPCMBuffer) -> Data? {
        guard let channelData = buffer.floatChannelData?[0] else { return nil }
        let frameCount = Int(buffer.frameLength)

        // Convert Float32 to Int16 for Opus
        var int16Samples = [Int16](repeating: 0, count: frameCount)
        for i in 0..<frameCount {
            let clamped = max(-1.0, min(1.0, channelData[i]))
            int16Samples[i] = Int16(clamped * Float(Int16.max))
        }

        // In production, call opus_encode() here
        // For now, return raw PCM compressed with simple encoding
        let data = int16Samples.withUnsafeBytes { Data($0) }
        return data
    }
}

/// Opus audio decoder for VoIP reception.
final class OpusDecoder {
    private let sampleRate: Double = 48000
    private let channels: AVAudioChannelCount = 1

    func decode(_ data: Data) -> AVAudioPCMBuffer? {
        let format = AVAudioFormat(
            standardFormatWithSampleRate: sampleRate,
            channels: channels
        )!

        // In production, call opus_decode() here
        // For now, decode raw PCM
        let sampleCount = data.count / MemoryLayout<Int16>.size
        guard let buffer = AVAudioPCMBuffer(
            pcmFormat: format,
            frameCapacity: AVAudioFrameCount(sampleCount)
        ) else { return nil }
        buffer.frameLength = AVAudioFrameCount(sampleCount)

        let outputData = buffer.floatChannelData![0]
        data.withUnsafeBytes { rawPtr in
            guard let int16Ptr = rawPtr.bindMemory(to: Int16.self).baseAddress else { return }
            for i in 0..<sampleCount {
                outputData[i] = Float(int16Ptr[i]) / Float(Int16.max)
            }
        }

        return buffer
    }
}
