// Test setup — database connection and cleanup for integration tests.
// For M1, this is a minimal setup. Integration test DB will be configured
// when the first schema tables are created in M2/M3.

import 'dotenv/config';

// Override env for test
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Suppress logs during tests
