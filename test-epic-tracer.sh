#!/bin/bash
# Integration test for epic tracer

set -e

echo "=== Epic Tracer Integration Test ==="
echo

# Test 1: Help command
echo "Test 1: Help command"
./bin/happy.mjs epic-trace --help | head -5
echo "✓ Help command works"
echo

# Test 2: Missing arguments (should error)
echo "Test 2: Error handling for missing arguments"
if ./bin/happy.mjs epic-trace 2>&1 | grep -q "Error:"; then
    echo "✓ Properly errors on missing arguments"
else
    echo "✗ Should error on missing arguments"
    exit 1
fi
echo

# Test 3: Real session file (short run)
echo "Test 3: Real session file processing"
SESSION_FILE="/home/etang/.claude/projects/-home-etang-gh/agent-d128cf32.jsonl"

if [ -f "$SESSION_FILE" ]; then
    # Create temp output dir
    OUTPUT_DIR="/tmp/epic-tracer-test-$(date +%s)"
    mkdir -p "$OUTPUT_DIR"

    echo "Processing: $SESSION_FILE"
    echo "Output: $OUTPUT_DIR"

    # Run tracer for 3 seconds then kill
    timeout 3s ./bin/happy.mjs epic-trace integration-test \
        --session-file "$SESSION_FILE" \
        --output-dir "$OUTPUT_DIR" \
        --include-cot \
        || true  # timeout returns non-zero

    # Check if output file was created
    OUTPUT_FILE=$(find "$OUTPUT_DIR" -name "exec-log-*.jsonl" | head -1)

    if [ -n "$OUTPUT_FILE" ] && [ -f "$OUTPUT_FILE" ]; then
        echo "✓ Output file created: $OUTPUT_FILE"

        # Count lines
        LINE_COUNT=$(wc -l < "$OUTPUT_FILE")
        echo "✓ Events written: $LINE_COUNT"

        # Validate JSON format
        if head -1 "$OUTPUT_FILE" | jq . > /dev/null 2>&1; then
            echo "✓ Valid JSONL format"
        else
            echo "✗ Invalid JSONL format"
            exit 1
        fi

        # Show sample entries
        echo
        echo "Sample entries:"
        head -3 "$OUTPUT_FILE" | jq -c .

        # Cleanup
        rm -rf "$OUTPUT_DIR"
    else
        echo "✗ Output file not created"
        exit 1
    fi
else
    echo "⚠ Test session file not found, skipping real file test"
fi

echo
echo "=== All Integration Tests Passed ✓ ==="
