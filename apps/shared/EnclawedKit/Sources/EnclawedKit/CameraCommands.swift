import Foundation

public enum EnclawedCameraCommand: String, Codable, Sendable {
    case list = "camera.list"
    case snap = "camera.snap"
    case clip = "camera.clip"
}

public enum EnclawedCameraFacing: String, Codable, Sendable {
    case back
    case front
}

public enum EnclawedCameraImageFormat: String, Codable, Sendable {
    case jpg
    case jpeg
}

public enum EnclawedCameraVideoFormat: String, Codable, Sendable {
    case mp4
}

public struct EnclawedCameraSnapParams: Codable, Sendable, Equatable {
    public var facing: EnclawedCameraFacing?
    public var maxWidth: Int?
    public var quality: Double?
    public var format: EnclawedCameraImageFormat?
    public var deviceId: String?
    public var delayMs: Int?

    public init(
        facing: EnclawedCameraFacing? = nil,
        maxWidth: Int? = nil,
        quality: Double? = nil,
        format: EnclawedCameraImageFormat? = nil,
        deviceId: String? = nil,
        delayMs: Int? = nil)
    {
        self.facing = facing
        self.maxWidth = maxWidth
        self.quality = quality
        self.format = format
        self.deviceId = deviceId
        self.delayMs = delayMs
    }
}

public struct EnclawedCameraClipParams: Codable, Sendable, Equatable {
    public var facing: EnclawedCameraFacing?
    public var durationMs: Int?
    public var includeAudio: Bool?
    public var format: EnclawedCameraVideoFormat?
    public var deviceId: String?

    public init(
        facing: EnclawedCameraFacing? = nil,
        durationMs: Int? = nil,
        includeAudio: Bool? = nil,
        format: EnclawedCameraVideoFormat? = nil,
        deviceId: String? = nil)
    {
        self.facing = facing
        self.durationMs = durationMs
        self.includeAudio = includeAudio
        self.format = format
        self.deviceId = deviceId
    }
}
