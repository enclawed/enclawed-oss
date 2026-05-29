import Foundation

public enum EnclawedDeviceCommand: String, Codable, Sendable {
    case status = "device.status"
    case info = "device.info"
}

public enum EnclawedBatteryState: String, Codable, Sendable {
    case unknown
    case unplugged
    case charging
    case full
}

public enum EnclawedThermalState: String, Codable, Sendable {
    case nominal
    case fair
    case serious
    case critical
}

public enum EnclawedNetworkPathStatus: String, Codable, Sendable {
    case satisfied
    case unsatisfied
    case requiresConnection
}

public enum EnclawedNetworkInterfaceType: String, Codable, Sendable {
    case wifi
    case cellular
    case wired
    case other
}

public struct EnclawedBatteryStatusPayload: Codable, Sendable, Equatable {
    public var level: Double?
    public var state: EnclawedBatteryState
    public var lowPowerModeEnabled: Bool

    public init(level: Double?, state: EnclawedBatteryState, lowPowerModeEnabled: Bool) {
        self.level = level
        self.state = state
        self.lowPowerModeEnabled = lowPowerModeEnabled
    }
}

public struct EnclawedThermalStatusPayload: Codable, Sendable, Equatable {
    public var state: EnclawedThermalState

    public init(state: EnclawedThermalState) {
        self.state = state
    }
}

public struct EnclawedStorageStatusPayload: Codable, Sendable, Equatable {
    public var totalBytes: Int64
    public var freeBytes: Int64
    public var usedBytes: Int64

    public init(totalBytes: Int64, freeBytes: Int64, usedBytes: Int64) {
        self.totalBytes = totalBytes
        self.freeBytes = freeBytes
        self.usedBytes = usedBytes
    }
}

public struct EnclawedNetworkStatusPayload: Codable, Sendable, Equatable {
    public var status: EnclawedNetworkPathStatus
    public var isExpensive: Bool
    public var isConstrained: Bool
    public var interfaces: [EnclawedNetworkInterfaceType]

    public init(
        status: EnclawedNetworkPathStatus,
        isExpensive: Bool,
        isConstrained: Bool,
        interfaces: [EnclawedNetworkInterfaceType])
    {
        self.status = status
        self.isExpensive = isExpensive
        self.isConstrained = isConstrained
        self.interfaces = interfaces
    }
}

public struct EnclawedDeviceStatusPayload: Codable, Sendable, Equatable {
    public var battery: EnclawedBatteryStatusPayload
    public var thermal: EnclawedThermalStatusPayload
    public var storage: EnclawedStorageStatusPayload
    public var network: EnclawedNetworkStatusPayload
    public var uptimeSeconds: Double

    public init(
        battery: EnclawedBatteryStatusPayload,
        thermal: EnclawedThermalStatusPayload,
        storage: EnclawedStorageStatusPayload,
        network: EnclawedNetworkStatusPayload,
        uptimeSeconds: Double)
    {
        self.battery = battery
        self.thermal = thermal
        self.storage = storage
        self.network = network
        self.uptimeSeconds = uptimeSeconds
    }
}

public struct EnclawedDeviceInfoPayload: Codable, Sendable, Equatable {
    public var deviceName: String
    public var modelIdentifier: String
    public var systemName: String
    public var systemVersion: String
    public var appVersion: String
    public var appBuild: String
    public var locale: String

    public init(
        deviceName: String,
        modelIdentifier: String,
        systemName: String,
        systemVersion: String,
        appVersion: String,
        appBuild: String,
        locale: String)
    {
        self.deviceName = deviceName
        self.modelIdentifier = modelIdentifier
        self.systemName = systemName
        self.systemVersion = systemVersion
        self.appVersion = appVersion
        self.appBuild = appBuild
        self.locale = locale
    }
}
