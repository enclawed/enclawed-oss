import CoreLocation
import Foundation
import EnclawedKit
import UIKit

typealias EnclawedCameraSnapResult = (format: String, base64: String, width: Int, height: Int)
typealias EnclawedCameraClipResult = (format: String, base64: String, durationMs: Int, hasAudio: Bool)

protocol CameraServicing: Sendable {
    func listDevices() async -> [CameraController.CameraDeviceInfo]
    func snap(params: EnclawedCameraSnapParams) async throws -> EnclawedCameraSnapResult
    func clip(params: EnclawedCameraClipParams) async throws -> EnclawedCameraClipResult
}

protocol ScreenRecordingServicing: Sendable {
    func record(
        screenIndex: Int?,
        durationMs: Int?,
        fps: Double?,
        includeAudio: Bool?,
        outPath: String?) async throws -> String
}

@MainActor
protocol LocationServicing: Sendable {
    func authorizationStatus() -> CLAuthorizationStatus
    func accuracyAuthorization() -> CLAccuracyAuthorization
    func ensureAuthorization(mode: EnclawedLocationMode) async -> CLAuthorizationStatus
    func currentLocation(
        params: EnclawedLocationGetParams,
        desiredAccuracy: EnclawedLocationAccuracy,
        maxAgeMs: Int?,
        timeoutMs: Int?) async throws -> CLLocation
    func startLocationUpdates(
        desiredAccuracy: EnclawedLocationAccuracy,
        significantChangesOnly: Bool) -> AsyncStream<CLLocation>
    func stopLocationUpdates()
    func startMonitoringSignificantLocationChanges(onUpdate: @escaping @Sendable (CLLocation) -> Void)
    func stopMonitoringSignificantLocationChanges()
}

@MainActor
protocol DeviceStatusServicing: Sendable {
    func status() async throws -> EnclawedDeviceStatusPayload
    func info() -> EnclawedDeviceInfoPayload
}

protocol PhotosServicing: Sendable {
    func latest(params: EnclawedPhotosLatestParams) async throws -> EnclawedPhotosLatestPayload
}

protocol ContactsServicing: Sendable {
    func search(params: EnclawedContactsSearchParams) async throws -> EnclawedContactsSearchPayload
    func add(params: EnclawedContactsAddParams) async throws -> EnclawedContactsAddPayload
}

protocol CalendarServicing: Sendable {
    func events(params: EnclawedCalendarEventsParams) async throws -> EnclawedCalendarEventsPayload
    func add(params: EnclawedCalendarAddParams) async throws -> EnclawedCalendarAddPayload
}

protocol RemindersServicing: Sendable {
    func list(params: EnclawedRemindersListParams) async throws -> EnclawedRemindersListPayload
    func add(params: EnclawedRemindersAddParams) async throws -> EnclawedRemindersAddPayload
}

protocol MotionServicing: Sendable {
    func activities(params: EnclawedMotionActivityParams) async throws -> EnclawedMotionActivityPayload
    func pedometer(params: EnclawedPedometerParams) async throws -> EnclawedPedometerPayload
}

struct WatchMessagingStatus: Sendable, Equatable {
    var supported: Bool
    var paired: Bool
    var appInstalled: Bool
    var reachable: Bool
    var activationState: String
}

struct WatchQuickReplyEvent: Sendable, Equatable {
    var replyId: String
    var promptId: String
    var actionId: String
    var actionLabel: String?
    var sessionKey: String?
    var note: String?
    var sentAtMs: Int?
    var transport: String
}

struct WatchExecApprovalResolveEvent: Sendable, Equatable {
    var replyId: String
    var approvalId: String
    var decision: EnclawedWatchExecApprovalDecision
    var sentAtMs: Int?
    var transport: String
}

struct WatchExecApprovalSnapshotRequestEvent: Sendable, Equatable {
    var requestId: String
    var sentAtMs: Int?
    var transport: String
}

struct WatchNotificationSendResult: Sendable, Equatable {
    var deliveredImmediately: Bool
    var queuedForDelivery: Bool
    var transport: String
}

protocol WatchMessagingServicing: AnyObject, Sendable {
    func status() async -> WatchMessagingStatus
    func setStatusHandler(_ handler: (@Sendable (WatchMessagingStatus) -> Void)?)
    func setReplyHandler(_ handler: (@Sendable (WatchQuickReplyEvent) -> Void)?)
    func setExecApprovalResolveHandler(_ handler: (@Sendable (WatchExecApprovalResolveEvent) -> Void)?)
    func setExecApprovalSnapshotRequestHandler(
        _ handler: (@Sendable (WatchExecApprovalSnapshotRequestEvent) -> Void)?)
    func sendNotification(
        id: String,
        params: EnclawedWatchNotifyParams) async throws -> WatchNotificationSendResult
    func sendExecApprovalPrompt(
        _ message: EnclawedWatchExecApprovalPromptMessage) async throws -> WatchNotificationSendResult
    func sendExecApprovalResolved(
        _ message: EnclawedWatchExecApprovalResolvedMessage) async throws -> WatchNotificationSendResult
    func sendExecApprovalExpired(
        _ message: EnclawedWatchExecApprovalExpiredMessage) async throws -> WatchNotificationSendResult
    func syncExecApprovalSnapshot(
        _ message: EnclawedWatchExecApprovalSnapshotMessage) async throws -> WatchNotificationSendResult
}

extension CameraController: CameraServicing {}
extension ScreenRecordService: ScreenRecordingServicing {}
extension LocationService: LocationServicing {}
