package ai.enclawed.app.protocol

import org.junit.Assert.assertEquals
import org.junit.Test

class EnclawedProtocolConstantsTest {
  @Test
  fun canvasCommandsUseStableStrings() {
    assertEquals("canvas.present", EnclawedCanvasCommand.Present.rawValue)
    assertEquals("canvas.hide", EnclawedCanvasCommand.Hide.rawValue)
    assertEquals("canvas.navigate", EnclawedCanvasCommand.Navigate.rawValue)
    assertEquals("canvas.eval", EnclawedCanvasCommand.Eval.rawValue)
    assertEquals("canvas.snapshot", EnclawedCanvasCommand.Snapshot.rawValue)
  }

  @Test
  fun a2uiCommandsUseStableStrings() {
    assertEquals("canvas.a2ui.push", EnclawedCanvasA2UICommand.Push.rawValue)
    assertEquals("canvas.a2ui.pushJSONL", EnclawedCanvasA2UICommand.PushJSONL.rawValue)
    assertEquals("canvas.a2ui.reset", EnclawedCanvasA2UICommand.Reset.rawValue)
  }

  @Test
  fun capabilitiesUseStableStrings() {
    assertEquals("canvas", EnclawedCapability.Canvas.rawValue)
    assertEquals("camera", EnclawedCapability.Camera.rawValue)
    assertEquals("voiceWake", EnclawedCapability.VoiceWake.rawValue)
    assertEquals("location", EnclawedCapability.Location.rawValue)
    assertEquals("sms", EnclawedCapability.Sms.rawValue)
    assertEquals("device", EnclawedCapability.Device.rawValue)
    assertEquals("notifications", EnclawedCapability.Notifications.rawValue)
    assertEquals("system", EnclawedCapability.System.rawValue)
    assertEquals("photos", EnclawedCapability.Photos.rawValue)
    assertEquals("contacts", EnclawedCapability.Contacts.rawValue)
    assertEquals("calendar", EnclawedCapability.Calendar.rawValue)
    assertEquals("motion", EnclawedCapability.Motion.rawValue)
    assertEquals("callLog", EnclawedCapability.CallLog.rawValue)
  }

  @Test
  fun cameraCommandsUseStableStrings() {
    assertEquals("camera.list", EnclawedCameraCommand.List.rawValue)
    assertEquals("camera.snap", EnclawedCameraCommand.Snap.rawValue)
    assertEquals("camera.clip", EnclawedCameraCommand.Clip.rawValue)
  }

  @Test
  fun notificationsCommandsUseStableStrings() {
    assertEquals("notifications.list", EnclawedNotificationsCommand.List.rawValue)
    assertEquals("notifications.actions", EnclawedNotificationsCommand.Actions.rawValue)
  }

  @Test
  fun deviceCommandsUseStableStrings() {
    assertEquals("device.status", EnclawedDeviceCommand.Status.rawValue)
    assertEquals("device.info", EnclawedDeviceCommand.Info.rawValue)
    assertEquals("device.permissions", EnclawedDeviceCommand.Permissions.rawValue)
    assertEquals("device.health", EnclawedDeviceCommand.Health.rawValue)
  }

  @Test
  fun systemCommandsUseStableStrings() {
    assertEquals("system.notify", EnclawedSystemCommand.Notify.rawValue)
  }

  @Test
  fun photosCommandsUseStableStrings() {
    assertEquals("photos.latest", EnclawedPhotosCommand.Latest.rawValue)
  }

  @Test
  fun contactsCommandsUseStableStrings() {
    assertEquals("contacts.search", EnclawedContactsCommand.Search.rawValue)
    assertEquals("contacts.add", EnclawedContactsCommand.Add.rawValue)
  }

  @Test
  fun calendarCommandsUseStableStrings() {
    assertEquals("calendar.events", EnclawedCalendarCommand.Events.rawValue)
    assertEquals("calendar.add", EnclawedCalendarCommand.Add.rawValue)
  }

  @Test
  fun motionCommandsUseStableStrings() {
    assertEquals("motion.activity", EnclawedMotionCommand.Activity.rawValue)
    assertEquals("motion.pedometer", EnclawedMotionCommand.Pedometer.rawValue)
  }

  @Test
  fun smsCommandsUseStableStrings() {
    assertEquals("sms.send", EnclawedSmsCommand.Send.rawValue)
    assertEquals("sms.search", EnclawedSmsCommand.Search.rawValue)
  }

  @Test
  fun callLogCommandsUseStableStrings() {
    assertEquals("callLog.search", EnclawedCallLogCommand.Search.rawValue)
  }

}
