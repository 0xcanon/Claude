import Foundation

/// HTTP API client for server communication.
final class APIClient {
    static let shared = APIClient()

    private let session: URLSession
    private var baseURL: String {
        "https://\(SettingsStore.shared.serverHost)"
    }

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 15
        config.timeoutIntervalForResource = 30
        config.waitsForConnectivity = true
        session = URLSession(configuration: config)
    }

    // MARK: - Push Token Registration

    func registerPushToken(_ token: String) {
        let endpoint = "\(baseURL)/api/v1/devices/register"
        let body: [String: Any] = [
            "push_token": token,
            "platform": "ios",
            "app_version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        ]

        post(endpoint: endpoint, body: body) { result in
            switch result {
            case .success:
                print("[API] Push token registered")
            case .failure(let error):
                print("[API] Push token registration failed: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Voice Model Sync

    func uploadVoiceEmbedding(
        _ embeddingData: Data,
        name: String,
        completion: @escaping (Result<String, Error>) -> Void
    ) {
        let endpoint = "\(baseURL)/api/v1/voices/upload"
        let boundary = UUID().uuidString

        var request = URLRequest(url: URL(string: endpoint)!)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()
        // Name field
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"name\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(name)\r\n".data(using: .utf8)!)
        // Embedding file
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"embedding\"; filename=\"embedding.bin\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: application/octet-stream\r\n\r\n".data(using: .utf8)!)
        body.append(embeddingData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)

        request.httpBody = body

        session.dataTask(with: request) { data, response, error in
            if let error = error {
                completion(.failure(error))
                return
            }

            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let voiceId = json["voice_id"] as? String else {
                completion(.failure(APIError.invalidResponse))
                return
            }

            completion(.success(voiceId))
        }.resume()
    }

    // MARK: - Call History Sync

    func syncCallHistory(
        _ calls: [CallSession],
        completion: @escaping (Result<Void, Error>) -> Void
    ) {
        let endpoint = "\(baseURL)/api/v1/calls/sync"
        let callData = calls.map { call in
            [
                "id": call.id.uuidString,
                "handle": call.handle,
                "direction": call.direction.rawValue,
                "duration": call.duration,
                "start_time": call.startTime?.timeIntervalSince1970 ?? 0
            ] as [String: Any]
        }

        post(endpoint: endpoint, body: ["calls": callData]) { result in
            completion(result.map { _ in () })
        }
    }

    // MARK: - HTTP Helpers

    private func post(
        endpoint: String,
        body: [String: Any],
        completion: @escaping (Result<Data, Error>) -> Void
    ) {
        guard let url = URL(string: endpoint) else {
            completion(.failure(APIError.invalidURL))
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        } catch {
            completion(.failure(error))
            return
        }

        session.dataTask(with: request) { data, response, error in
            if let error = error {
                completion(.failure(error))
                return
            }

            guard let httpResponse = response as? HTTPURLResponse,
                  (200...299).contains(httpResponse.statusCode) else {
                completion(.failure(APIError.serverError))
                return
            }

            completion(.success(data ?? Data()))
        }.resume()
    }

    enum APIError: LocalizedError {
        case invalidURL
        case invalidResponse
        case serverError

        var errorDescription: String? {
            switch self {
            case .invalidURL: return "Invalid URL"
            case .invalidResponse: return "Invalid server response"
            case .serverError: return "Server error"
            }
        }
    }
}
