package ai.enclawed.app.node

import ai.enclawed.app.protocol.EnclawedCalendarCommand
import ai.enclawed.app.protocol.EnclawedCameraCommand
import ai.enclawed.app.protocol.EnclawedCallLogCommand
import ai.enclawed.app.protocol.EnclawedCapability
import ai.enclawed.app.protocol.EnclawedContactsCommand
import ai.enclawed.app.protocol.EnclawedDeviceCommand
import ai.enclawed.app.protocol.EnclawedLocationCommand
import ai.enclawed.app.protocol.EnclawedMotionCommand
import ai.enclawed.app.protocol.EnclawedNotificationsCommand
import ai.enclawed.app.protocol.EnclawedPhotosCommand
import ai.enclawed.app.protocol.EnclawedSmsCommand
import ai.enclawed.app.protocol.EnclawedSystemCommand
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class InvokeCommandRegistryTest {
  private val coreCapabilities =
    setOf(
      EnclawedCapability.Canvas.rawValue,
      EnclawedCapability.Device.rawValue,
      EnclawedCapability.Notifications.rawValue,
      EnclawedCapability.System.rawValue,
      EnclawedCapability.Photos.rawValue,
      EnclawedCapability.Contacts.rawValue,
      EnclawedCapability.Calendar.rawValue,
    )

  private val optionalCapabilities =
    setOf(
      EnclawedCapability.Camera.rawValue,
      EnclawedCapability.Location.rawValue,
      EnclawedCapability.Sms.rawValue,
      EnclawedCapability.CallLog.rawValue,
      EnclawedCapability.VoiceWake.rawValue,
      EnclawedCapability.Motion.rawValue,
    )

  private val coreCommands =
    setOf(
      EnclawedDeviceCommand.Status.rawValue,
      EnclawedDeviceCommand.Info.rawValue,
      EnclawedDeviceCommand.Permissions.rawValue,
      EnclawedDeviceCommand.Health.rawValue,
      EnclawedNotificationsCommand.List.rawValue,
      EnclawedNotificationsCommand.Actions.rawValue,
      EnclawedSystemCommand.Notify.rawValue,
      EnclawedPhotosCommand.Latest.rawValue,
      EnclawedContactsCommand.Search.rawValue,
      EnclawedContactsCommand.Add.rawValue,
      EnclawedCalendarCommand.Events.rawValue,
      EnclawedCalendarCommand.Add.rawValue,
    )

  private val optionalCommands =
    setOf(
      EnclawedCameraCommand.Snap.rawValue,
      EnclawedCameraCommand.Clip.rawValue,
      EnclawedCameraCommand.List.rawValue,
      EnclawedLocationCommand.Get.rawValue,
      EnclawedMotionCommand.Activity.rawValue,
      EnclawedMotionCommand.Pedometer.rawValue,
      EnclawedSmsCommand.Send.rawValue,
      EnclawedSmsCommand.Search.rawValue,
      EnclawedCallLogCommand.Search.rawValue,
    )

  private val debugCommands = setOf("debug.logs", "debug.ed25519")

  @Test
  fun advertisedCapabilities_respectsFeatureAvailability() {
    val capabilities = InvokeCommandRegistry.advertisedCapabilities(defaultFlags())

    assertContainsAll(capabilities, coreCapabilities)
    assertMissingAll(capabilities, optionalCapabilities)
  }

  @Test
  fun advertisedCapabilities_includesFeatureCapabilitiesWhenEnabled() {
    val capabilities =
      InvokeCommandRegistry.advertisedCapabilities(
        defaultFlags(
          cameraEnabled = true,
          locationEnabled = true,
          sendSmsAvailable = true,
          readSmsAvailable = true,
          smsSearchPossible = true,
          callLogAvailable = true,
          voiceWakeEnabled = true,
          motionActivityAvailable = true,
          motionPedometerAvailable = true,
        ),
      )

    assertContainsAll(capabilities, coreCapabilities + optionalCapabilities)
  }

  @Test
  fun advertisedCommands_respectsFeatureAvailability() {
    val commands = InvokeCommandRegistry.advertisedCommands(defaultFlags())

    assertContainsAll(commands, coreCommands)
    assertMissingAll(commands, optionalCommands + debugCommands)
  }

  @Test
  fun advertisedCommands_includesFeatureCommandsWhenEnabled() {
    val commands =
      InvokeCommandRegistry.advertisedCommands(
        defaultFlags(
          cameraEnabled = true,
          locationEnabled = true,
          sendSmsAvailable = true,
          readSmsAvailable = true,
          smsSearchPossible = true,
          callLogAvailable = true,
          motionActivityAvailable = true,
          motionPedometerAvailable = true,
          debugBuild = true,
        ),
      )

    assertContainsAll(commands, coreCommands + optionalCommands + debugCommands)
  }

  @Test
  fun advertisedCommands_onlyIncludesSupportedMotionCommands() {
    val commands =
      InvokeCommandRegistry.advertisedCommands(
        NodeRuntimeFlags(
          cameraEnabled = false,
          locationEnabled = false,
          sendSmsAvailable = false,
          readSmsAvailable = false,
          smsSearchPossible = false,
          callLogAvailable = false,
          voiceWakeEnabled = false,
          motionActivityAvailable = true,
          motionPedometerAvailable = false,
          debugBuild = false,
        ),
      )

    assertTrue(commands.contains(EnclawedMotionCommand.Activity.rawValue))
    assertFalse(commands.contains(EnclawedMotionCommand.Pedometer.rawValue))
  }

  @Test
  fun advertisedCommands_splitsSmsSendAndSearchAvailability() {
    val readOnlyCommands =
      InvokeCommandRegistry.advertisedCommands(
        defaultFlags(readSmsAvailable = true, smsSearchPossible = true),
      )
    val sendOnlyCommands =
      InvokeCommandRegistry.advertisedCommands(
        defaultFlags(sendSmsAvailable = true),
      )
    val requestableSearchCommands =
      InvokeCommandRegistry.advertisedCommands(
        defaultFlags(smsSearchPossible = true),
      )

    assertTrue(readOnlyCommands.contains(EnclawedSmsCommand.Search.rawValue))
    assertFalse(readOnlyCommands.contains(EnclawedSmsCommand.Send.rawValue))
    assertTrue(sendOnlyCommands.contains(EnclawedSmsCommand.Send.rawValue))
    assertFalse(sendOnlyCommands.contains(EnclawedSmsCommand.Search.rawValue))
    assertTrue(requestableSearchCommands.contains(EnclawedSmsCommand.Search.rawValue))
  }

  @Test
  fun advertisedCapabilities_includeSmsWhenEitherSmsPathIsAvailable() {
    val readOnlyCapabilities =
      InvokeCommandRegistry.advertisedCapabilities(
        defaultFlags(readSmsAvailable = true),
      )
    val sendOnlyCapabilities =
      InvokeCommandRegistry.advertisedCapabilities(
        defaultFlags(sendSmsAvailable = true),
      )
    val requestableSearchCapabilities =
      InvokeCommandRegistry.advertisedCapabilities(
        defaultFlags(smsSearchPossible = true),
      )

    assertTrue(readOnlyCapabilities.contains(EnclawedCapability.Sms.rawValue))
    assertTrue(sendOnlyCapabilities.contains(EnclawedCapability.Sms.rawValue))
    assertFalse(requestableSearchCapabilities.contains(EnclawedCapability.Sms.rawValue))
  }

  @Test
  fun advertisedCommands_excludesCallLogWhenUnavailable() {
    val commands = InvokeCommandRegistry.advertisedCommands(defaultFlags(callLogAvailable = false))

    assertFalse(commands.contains(EnclawedCallLogCommand.Search.rawValue))
  }

  @Test
  fun advertisedCapabilities_excludesCallLogWhenUnavailable() {
    val capabilities = InvokeCommandRegistry.advertisedCapabilities(defaultFlags(callLogAvailable = false))

    assertFalse(capabilities.contains(EnclawedCapability.CallLog.rawValue))
  }

  @Test
  fun advertisedCapabilities_includesVoiceWakeWithoutAdvertisingCommands() {
    val capabilities = InvokeCommandRegistry.advertisedCapabilities(defaultFlags(voiceWakeEnabled = true))
    val commands = InvokeCommandRegistry.advertisedCommands(defaultFlags(voiceWakeEnabled = true))

    assertTrue(capabilities.contains(EnclawedCapability.VoiceWake.rawValue))
    assertFalse(commands.any { it.contains("voice", ignoreCase = true) })
  }

  @Test
  fun find_returnsForegroundMetadataForCameraCommands() {
    val list = InvokeCommandRegistry.find(EnclawedCameraCommand.List.rawValue)
    val location = InvokeCommandRegistry.find(EnclawedLocationCommand.Get.rawValue)

    assertNotNull(list)
    assertEquals(true, list?.requiresForeground)
    assertNotNull(location)
    assertEquals(false, location?.requiresForeground)
  }

  @Test
  fun find_returnsNullForUnknownCommand() {
    assertNull(InvokeCommandRegistry.find("not.real"))
  }

  private fun defaultFlags(
    cameraEnabled: Boolean = false,
    locationEnabled: Boolean = false,
    sendSmsAvailable: Boolean = false,
    readSmsAvailable: Boolean = false,
    smsSearchPossible: Boolean = false,
    callLogAvailable: Boolean = false,
    voiceWakeEnabled: Boolean = false,
    motionActivityAvailable: Boolean = false,
    motionPedometerAvailable: Boolean = false,
    debugBuild: Boolean = false,
  ): NodeRuntimeFlags =
    NodeRuntimeFlags(
      cameraEnabled = cameraEnabled,
      locationEnabled = locationEnabled,
      sendSmsAvailable = sendSmsAvailable,
      readSmsAvailable = readSmsAvailable,
      smsSearchPossible = smsSearchPossible,
      callLogAvailable = callLogAvailable,
      voiceWakeEnabled = voiceWakeEnabled,
      motionActivityAvailable = motionActivityAvailable,
      motionPedometerAvailable = motionPedometerAvailable,
      debugBuild = debugBuild,
    )

  private fun assertContainsAll(actual: List<String>, expected: Set<String>) {
    expected.forEach { value -> assertTrue(actual.contains(value)) }
  }

  private fun assertMissingAll(actual: List<String>, forbidden: Set<String>) {
    forbidden.forEach { value -> assertFalse(actual.contains(value)) }
  }
}
