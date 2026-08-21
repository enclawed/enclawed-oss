import Foundation
import Testing
@testable import Enclawed

@Suite(.serialized) struct NodeServiceManagerTests {
    @Test func `builds node service commands with current CLI shape`() async throws {
        try await TestIsolation.withUserDefaultsValues(["enclawed.gatewayProjectRootPath": nil]) {
            let tmp = try makeTempDirForTests()
            CommandResolver.setProjectRoot(tmp.path)

            let enclawedPath = tmp.appendingPathComponent("node_modules/.bin/enclawed")
            try makeExecutableForTests(at: enclawedPath)

            let start = NodeServiceManager._testServiceCommand(["start"])
            #expect(start == [enclawedPath.path, "node", "start", "--json"])

            let stop = NodeServiceManager._testServiceCommand(["stop"])
            #expect(stop == [enclawedPath.path, "node", "stop", "--json"])
        }
    }
}
