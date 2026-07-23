import assert from "assert";
import { DockgeServer } from "./dockge-server";

console.log("Running parseStacksDirs tests...");

function testParseStacksDirs() {
    // Test 1: Single stacksDir
    let result = DockgeServer.parseStacksDirs("/opt/stacks", undefined, undefined, "/opt/stacks");
    assert.strictEqual(result.configStacksDir, "/opt/stacks");
    assert.deepStrictEqual(result.stacksDirs, ["/opt/stacks"]);

    // Test 2: DOCKGE_STACKS_DIR contains colons
    result = DockgeServer.parseStacksDirs(undefined, "/opt:/opt/ms:/opt/emc", undefined, "/opt/stacks");
    assert.strictEqual(result.configStacksDir, "/opt");
    assert.deepStrictEqual(result.stacksDirs, ["/opt", "/opt/ms", "/opt/emc"]);

    // Test 3: Appending DOCKGE_STACKS and deduplication
    result = DockgeServer.parseStacksDirs(undefined, "/opt:/opt/ms", "/opt/emc:/opt", "/opt/stacks");
    assert.strictEqual(result.configStacksDir, "/opt");
    assert.deepStrictEqual(result.stacksDirs, ["/opt", "/opt/ms", "/opt/emc"]);

    // Test 4: Handling empty values
    result = DockgeServer.parseStacksDirs(undefined, undefined, undefined, "/opt/stacks");
    assert.strictEqual(result.configStacksDir, "/opt/stacks");
    assert.deepStrictEqual(result.stacksDirs, ["/opt/stacks"]);

    console.log("All tests passed!");
}

testParseStacksDirs();
