/**
 * Global test setup for CC-Middleware tests.
 */

import { mkdirSync, rmSync } from "node:fs";
import { TEST_TEMP_DIR } from "./fixtures.js";

/** Ensure the test temp directory exists */
export function ensureTestTempDir(): void {
  mkdirSync(TEST_TEMP_DIR, { recursive: true });
}

/** Clean up the test temp directory */
export function cleanupTestTempDir(): void {
  try {
    rmSync(TEST_TEMP_DIR, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/** Setup hook for beforeAll */
export function setupTestEnvironment(): void {
  ensureTestTempDir();
}

/** Teardown hook for afterAll */
export function teardownTestEnvironment(): void {
  cleanupTestTempDir();
}
