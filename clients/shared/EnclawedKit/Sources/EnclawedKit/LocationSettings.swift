import Foundation

public enum EnclawedLocationMode: String, Codable, Sendable, CaseIterable {
    case off
    case whileUsing
    case always
}
