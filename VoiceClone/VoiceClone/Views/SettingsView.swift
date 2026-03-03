import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var audioEngineVM: AudioEngineViewModel
    @StateObject private var store = SettingsStore.shared
    @State private var showServerConfig = false

    var body: some View {
        NavigationStack {
            List {
                // Audio section
                audioSection

                // Processing section
                processingSection

                // Server section
                serverSection

                // About section
                aboutSection
            }
            .navigationTitle("Settings")
        }
    }

    // MARK: - Audio

    private var audioSection: some View {
        Section {
            HStack {
                Label("Sample Rate", systemImage: "waveform.circle")
                Spacer()
                Picker("", selection: $store.audioSettings.sampleRate) {
                    Text("44.1 kHz").tag(44100.0)
                    Text("48 kHz").tag(48000.0)
                }
                .pickerStyle(.menu)
            }

            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Label("Input Gain", systemImage: "mic.fill")
                    Spacer()
                    Text(String(format: "%.1f", store.audioSettings.inputGain))
                        .foregroundStyle(.secondary)
                        .font(.caption.monospaced())
                }
                Slider(value: $store.audioSettings.inputGain, in: 0.1...3.0)
                    .tint(.cyan)
            }

            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Label("Output Gain", systemImage: "speaker.wave.2.fill")
                    Spacer()
                    Text(String(format: "%.1f", store.audioSettings.outputGain))
                        .foregroundStyle(.secondary)
                        .font(.caption.monospaced())
                }
                Slider(value: $store.audioSettings.outputGain, in: 0.1...3.0)
                    .tint(.cyan)
            }
        } header: {
            Text("Audio")
        }
    }

    // MARK: - Processing

    private var processingSection: some View {
        Section {
            HStack {
                Label("Quality", systemImage: "dial.medium")
                Spacer()
                Picker("", selection: $store.audioSettings.processingQuality) {
                    ForEach(AudioSettings.ProcessingQuality.allCases, id: \.self) { quality in
                        Text(quality.rawValue).tag(quality)
                    }
                }
                .pickerStyle(.menu)
            }

            Toggle(isOn: $store.audioSettings.noiseSuppression) {
                Label("Noise Suppression", systemImage: "waveform.path.ecg")
            }
            .tint(.cyan)

            Toggle(isOn: $store.audioSettings.echoCancellation) {
                Label("Echo Cancellation", systemImage: "arrow.turn.up.left")
            }
            .tint(.cyan)

            Toggle(isOn: $store.audioSettings.automaticGainControl) {
                Label("Auto Gain Control", systemImage: "dial.low")
            }
            .tint(.cyan)

            Toggle(isOn: $store.audioSettings.highPassFilterEnabled) {
                Label("High-Pass Filter", systemImage: "line.3.horizontal.decrease")
            }
            .tint(.cyan)

            if store.audioSettings.highPassFilterEnabled {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Cutoff Frequency")
                        Spacer()
                        Text("\(Int(store.audioSettings.highPassCutoff)) Hz")
                            .foregroundStyle(.secondary)
                            .font(.caption.monospaced())
                    }
                    Slider(value: $store.audioSettings.highPassCutoff, in: 20...300, step: 10)
                        .tint(.cyan)
                }
            }
        } header: {
            Text("Processing")
        } footer: {
            Text("Lower quality = lower latency. High quality recommended for voice cloning.")
        }
    }

    // MARK: - Server

    private var serverSection: some View {
        Section {
            HStack {
                Label("Server", systemImage: "server.rack")
                Spacer()
                Text(store.serverHost)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            HStack {
                Label("Port", systemImage: "network")
                Spacer()
                Text("\(store.serverPort)")
                    .foregroundStyle(.secondary)
            }

            Button {
                showServerConfig = true
            } label: {
                Label("Configure Server", systemImage: "gear")
            }
            .sheet(isPresented: $showServerConfig) {
                ServerConfigSheet()
            }
        } header: {
            Text("VoIP Server")
        } footer: {
            Text("Connect to your VoIP server for making calls.")
        }
    }

    // MARK: - About

    private var aboutSection: some View {
        Section {
            HStack {
                Text("Version")
                Spacer()
                Text("1.0.0")
                    .foregroundStyle(.secondary)
            }

            HStack {
                Text("Audio Engine")
                Spacer()
                Text(audioEngineVM.isRunning ? "Running" : "Stopped")
                    .foregroundStyle(audioEngineVM.isRunning ? .green : .secondary)
            }

            if audioEngineVM.isRunning {
                HStack {
                    Text("Latency")
                    Spacer()
                    Text("\(String(format: "%.1f", audioEngineVM.currentLatencyMs))ms")
                        .foregroundStyle(.secondary)
                        .font(.caption.monospaced())
                }
            }
        } header: {
            Text("About")
        }
    }
}

// MARK: - Server Config Sheet

struct ServerConfigSheet: View {
    @StateObject private var store = SettingsStore.shared
    @Environment(\.dismiss) private var dismiss
    @State private var host: String = ""
    @State private var port: String = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Server Address") {
                    TextField("hostname or IP", text: $host)
                        .textContentType(.URL)
                        .autocapitalization(.none)
                        .disableAutocorrection(true)
                }

                Section("Port") {
                    TextField("Port", text: $port)
                        .keyboardType(.numberPad)
                }
            }
            .navigationTitle("Server Config")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") {
                        store.serverHost = host
                        store.serverPort = Int(port) ?? 443
                        dismiss()
                    }
                }
            }
            .onAppear {
                host = store.serverHost
                port = "\(store.serverPort)"
            }
        }
    }
}
