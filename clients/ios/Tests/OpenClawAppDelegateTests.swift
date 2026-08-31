import Testing
@testable import Enclawed

@Suite(.serialized) struct EnclawedAppDelegateTests {
    @Test @MainActor func resolvesRegistryModelBeforeViewTaskAssignsDelegateModel() {
        let registryModel = NodeAppModel()
        EnclawedAppModelRegistry.appModel = registryModel
        defer { EnclawedAppModelRegistry.appModel = nil }

        let delegate = EnclawedAppDelegate()

        #expect(delegate._test_resolvedAppModel() === registryModel)
    }

    @Test @MainActor func prefersExplicitDelegateModelOverRegistryFallback() {
        let registryModel = NodeAppModel()
        let explicitModel = NodeAppModel()
        EnclawedAppModelRegistry.appModel = registryModel
        defer { EnclawedAppModelRegistry.appModel = nil }

        let delegate = EnclawedAppDelegate()
        delegate.appModel = explicitModel

        #expect(delegate._test_resolvedAppModel() === explicitModel)
    }
}
