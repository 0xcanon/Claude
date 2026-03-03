import Foundation

/// WebSocket manager for VoIP signaling.
final class WebSocketManager: NSObject {
    private var webSocket: URLSessionWebSocketTask?
    private let session: URLSession
    private let url: String
    private var isConnected = false
    private var reconnectAttempts = 0
    private let maxReconnectAttempts = 5

    var onMessage: ((String) -> Void)?
    var onConnected: (() -> Void)?
    var onDisconnected: (() -> Void)?
    var onError: ((Error) -> Void)?

    init(url: String) {
        self.url = url
        let config = URLSessionConfiguration.default
        config.waitsForConnectivity = true
        self.session = URLSession(configuration: config)
        super.init()
    }

    // MARK: - Connection

    func connect() {
        guard let wsURL = URL(string: url) else {
            print("[WebSocket] Invalid URL: \(url)")
            return
        }

        webSocket = session.webSocketTask(with: wsURL)
        webSocket?.resume()

        isConnected = true
        reconnectAttempts = 0
        onConnected?()
        receiveMessage()

        print("[WebSocket] Connected to \(url)")
    }

    func disconnect() {
        isConnected = false
        webSocket?.cancel(with: .goingAway, reason: nil)
        webSocket = nil
        onDisconnected?()
    }

    // MARK: - Sending

    func send(_ message: String) {
        guard isConnected else { return }

        webSocket?.send(.string(message)) { [weak self] error in
            if let error = error {
                print("[WebSocket] Send error: \(error.localizedDescription)")
                self?.onError?(error)
            }
        }
    }

    func sendData(_ data: Data) {
        guard isConnected else { return }

        webSocket?.send(.data(data)) { [weak self] error in
            if let error = error {
                print("[WebSocket] Send data error: \(error.localizedDescription)")
                self?.onError?(error)
            }
        }
    }

    // MARK: - Receiving

    private func receiveMessage() {
        webSocket?.receive { [weak self] result in
            switch result {
            case .success(let message):
                switch message {
                case .string(let text):
                    self?.onMessage?(text)
                case .data(let data):
                    if let text = String(data: data, encoding: .utf8) {
                        self?.onMessage?(text)
                    }
                @unknown default:
                    break
                }
                // Continue listening
                self?.receiveMessage()

            case .failure(let error):
                print("[WebSocket] Receive error: \(error.localizedDescription)")
                self?.handleDisconnection()
            }
        }
    }

    // MARK: - Reconnection

    private func handleDisconnection() {
        guard isConnected else { return }

        isConnected = false
        onDisconnected?()

        guard reconnectAttempts < maxReconnectAttempts else {
            print("[WebSocket] Max reconnect attempts reached")
            return
        }

        reconnectAttempts += 1
        let delay = pow(2.0, Double(reconnectAttempts))
        print("[WebSocket] Reconnecting in \(delay)s (attempt \(reconnectAttempts))")

        DispatchQueue.global().asyncAfter(deadline: .now() + delay) { [weak self] in
            self?.connect()
        }
    }

    // MARK: - Ping/Pong

    func startPingTimer() {
        Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] timer in
            guard self?.isConnected == true else {
                timer.invalidate()
                return
            }
            self?.webSocket?.sendPing { error in
                if let error = error {
                    print("[WebSocket] Ping failed: \(error.localizedDescription)")
                }
            }
        }
    }
}
