#if os(macOS)
import AppKit
import Testing
@testable import EnclawedChatUI

@Suite
@MainActor
struct ChatComposerTextViewTests {
    @Test func configuredComposerTextViewEnablesUndo() {
        let textView = ChatComposerTextViewFactory.makeConfiguredTextView()

        #expect(textView.allowsUndo)
    }
}
#endif
