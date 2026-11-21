import SwiftUI

struct AdvancedPane: View {
    @Environment(HostController.self) private var host
    @Environment(Preferences.self) private var preferences

    var body: some View {
        @Bindable var preferences = preferences
        Form {
            Section("Server") {
                LabeledContent("Status") {
                    HStack(spacing: 6) {
                        StatusDot(color: statusColor)
                        Text(statusText)
                            .multilineTextAlignment(.trailing)
                            .textSelection(.enabled)
                    }
                }
                if let pairing = host.pairing, host.isRunning, !pairing.addresses.isEmpty {
                    LabeledContent(pairing.addresses.count == 1 ? "IP address" : "IP addresses") {
                        Text(pairing.addresses.map { pairing.vpnAddresses.contains($0) ? "\($0) (VPN)" : $0 }.joined(separator: "\n"))
                            .font(.body.monospaced())
                            .multilineTextAlignment(.trailing)
                            .textSelection(.enabled)
                            .foregroundStyle(.secondary)
                    }
                }
                DescribedToggle(
                    "Accept connections through a proxy on this Mac",
                    detail: "Only for a reverse proxy you run on this Mac, such as Caddy, nginx or a VPN’s HTTPS sharing. CmdPalm then believes the proxy about which device is connecting and whether the connection is encrypted. Leave this off otherwise.",
                    isOn: $preferences.allowLocalProxy
                )
                LabeledContent {
                    Button("Restart Server") { host.restart() }
                } label: {
                    Text("Restart the server")
                    Text("Every device disconnects briefly and reconnects on its own.")
                }
            }

            Section("Troubleshooting") {
                Toggle(isOn: Binding(
                    get: { host.touchpadDiagnosticsEnabled },
                    set: { host.setTouchpadDiagnosticsEnabled($0) }
                )) {
                    Text("Capture touchpad diagnostics")
                    Text("Records received movement, input-engine pacing, event targets and immediately observed cursor positions. Off by default; kept in memory.")
                }
                LabeledContent {
                    HStack {
                        Button("Export Touchpad JSON") { exportTouchpadDiagnostics() }
                        Button("Clear Capture") { host.clearTouchpadDiagnostics() }
                    }
                } label: {
                    Text("Touchpad capture")
                    Text("Export to a local JSON file; no typing, pairing tokens or network addresses are recorded. Up to 4,000 events.")
                }
                Picker(selection: $preferences.logLevel) {
                    ForEach(Preferences.LogLevel.allCases) { level in
                        Text(level.title).tag(level)
                    }
                } label: {
                    Text("Log detail")
                    Text("Takes effect the next time CmdPalm opens.")
                }
                LabeledContent {
                    HStack {
                        Button("Show Log") {
                            NSWorkspace.shared.activateFileViewerSelecting([SystemInfo.logFile])
                        }
                        Button("Show Data Folder") {
                            NSWorkspace.shared.open(SystemInfo.dataDirectory)
                        }
                    }
                } label: {
                    Text("Files")
                    Text("Logs never contain what you type.")
                }
                LabeledContent {
                    Button("Show Guide") { WelcomeWindowController.show() }
                } label: {
                    Text("Welcome guide")
                    Text("Walks through permissions and pairing again.")
                }
            }
        }
        .settingsForm()
    }

    private func exportTouchpadDiagnostics() {
        let json = host.touchpadDiagnosticsJSON()
        let panel = NSSavePanel()
        panel.title = "Export CmdPalm Touchpad Diagnostics"
        panel.nameFieldStringValue = "cmdpalm-mac-touchpad-\(ISO8601DateFormatter().string(from: Date()).replacingOccurrences(of: ":", with: "-")).json"
        panel.canCreateDirectories = true
        if panel.runModal() == .OK, let url = panel.url {
            do {
                try json.write(to: url, atomically: true, encoding: .utf8)
            } catch {
                NSAlert(error: error).runModal()
            }
        }
    }

    private var statusText: String {
        switch host.status {
        case .starting: "Starting…"
        case .stopped: "Stopped"
        case let .failed(message): "Couldn’t start: \(message)"
        case let .running(port): host.paused ? "Paused on port \(String(port))" : "Running on port \(String(port))"
        }
    }

    private var statusColor: Color {
        switch host.status {
        case .running: host.paused ? .orange : .green
        case .starting: .yellow
        case .stopped: .gray
        case .failed: .red
        }
    }
}
