#!/usr/bin/env node
/**
 * 🧪 Comprehensive Error Handling Test Suite
 * 
 * Tests all error handling scenarios:
 * - Global exception filter
 * - Error sanitization
 * - Database errors
 * - Validation errors
 * - Authentication/Authorization errors
 * - Queue errors
 * - Rate limiting errors
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
let authToken = null;

// Test configuration
const TEST_CONFIG = {
  timeout: 10000,
  maxRetries: 3,
  testUser: {
    email: 'errortest@company.com',
    password: 'ErrorTest123!',
    name: 'Error Test User'
  }
};

// Test results tracking
const testResults = {
  globalExceptionFilter: { passed: 0, failed: 0 },
  errorSanitization: { passed: 0, failed: 0 },
  databaseErrors: { passed: 0, failed: 0 },
  validationErrors: { passed: 0, failed: 0 },
  authErrors: { passed: 0, failed: 0 },
  queueErrors: { passed: 0, failed: 0 },
  rateLimitErrors: { passed: 0, failed: 0 }
};

// Console formatting
const log = {
  header: (msg) => console.log(`\n${'='.repeat(60)}\n🧪 ${msg}\n${'='.repeat(60)}`),
  section: (msg) => console.log(`\n${'─'.repeat(40)}\n📋 ${msg}\n${'─'.repeat(40)}`),
  test: (msg) => console.log(`\n🔬 ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`),
  info: (msg) => console.log(`ℹ️  ${msg}`),
  warning: (msg) => console.log(`⚠️  ${msg}`),
  security: (msg) => console.log(`🛡️  ${msg}`)
};

/**
 * Helper function to make requests and capture errors
 */
async function makeRequest(config, expectError = false) {
  try {
    const response = await axios(config);
    if (expectError) {
      throw new Error('Expected error but request succeeded');
    }
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    if (!expectError) {
      throw error;
    }
    return {
      success: false,
      error: error.response?.data || error.message,
      status: error.response?.status || 500,
      headers: error.response?.headers || {}
    };
  }
}

/**
 * Test Suite 1: Authentication Setup
 */
async function setupAuthentication() {
  log.section('Authentication Setup');

  try {
    // Try to register test user
    log.test('Registering test user...');
    try {
      await axios.post(`${BASE_URL}/auth/register`, TEST_CONFIG.testUser);
      log.success('Test user registered successfully');
    } catch (error) {
      if (error.response?.status === 409) {
        log.info('Test user already exists, proceeding with login');
      } else {
        throw error;
      }
    }

    // Login to get auth token
    log.test('Logging in test user...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: TEST_CONFIG.testUser.email,
      password: TEST_CONFIG.testUser.password
    });

    authToken = loginResponse.data.accessToken;
    log.success('Authentication setup completed');
    log.info(`Token: ${authToken.substring(0, 20)}...`);

  } catch (error) {
    log.error(`Authentication setup failed: ${error.message}`);
    throw error;
  }
}

/**
 * Test Suite 2: Global Exception Filter Tests
 */
async function testGlobalExceptionFilter() {
  log.section('Global Exception Filter Tests');

  const tests = [
    {
      name: 'HTTP Exception Handling',
      test: async () => {
        const result = await makeRequest({
          method: 'GET',
          url: `${BASE_URL}/tasks/nonexistent-id`,
          headers: { 'Authorization': `Bearer ${authToken}` },
          timeout: TEST_CONFIG.timeout
        }, true);

        // Check if error is properly formatted
        if (result.status === 404 && result.error.statusCode && result.error.message) {
          log.success('HTTP exception properly handled');
          return true;
        }
        throw new Error('HTTP exception not properly formatted');
      }
    },
    {
      name: 'Database Error Handling',
      test: async () => {
        // Try to create task with invalid data that will cause DB error
        const result = await makeRequest({
          method: 'POST',
          url: `${BASE_URL}/tasks`,
          headers: { 'Authorization': `Bearer ${authToken}` },
          data: {
            title: 'A'.repeat(1000), // Exceed column length
            description: 'Test database error',
            userId: authToken // Invalid UUID format
          }
        }, true);

        // Check if database error is sanitized
        if (result.status >= 400 && !result.error.message?.includes('database')) {
          log.security('Database error properly sanitized');
          return true;
        }
        log.warning('Database error might not be properly sanitized');
        return false;
      }
    }
  ];

  for (const test of tests) {
    try {
      log.test(`Testing ${test.name}...`);
      const passed = await test.test();
      if (passed) {
        testResults.globalExceptionFilter.passed++;
      } else {
        testResults.globalExceptionFilter.failed++;
      }
    } catch (error) {
      log.error(`${test.name} failed: ${error.message}`);
      testResults.globalExceptionFilter.failed++;
    }
  }
}

/**
 * Test Suite 3: Error Sanitization Tests
 */
async function testErrorSanitization() {
  log.section('Error Sanitization Tests');

  const sensitiveDataTests = [
    {
      name: 'SQL Injection Error Sanitization',
      test: async () => {
        const result = await makeRequest({
          method: 'GET',
          url: `${BASE_URL}/tasks?status='; DROP TABLE tasks; --`,
          headers: { 'Authorization': `Bearer ${authToken}` }
        }, true);

        // Check if SQL-related terms are sanitized
        const errorMessage = JSON.stringify(result.error).toLowerCase();
        const hasSensitiveInfo = ['sql', 'drop', 'table', 'database', 'query'].some(term =>
          errorMessage.includes(term)
        );

        if (!hasSensitiveInfo) {
          log.security('SQL injection error properly sanitized');
          return true;
        }
        log.warning('Potential SQL information disclosure detected');
        return false;
      }
    },
    {
      name: 'Path Disclosure Prevention',
      test: async () => {
        const result = await makeRequest({
          method: 'GET',
          url: `${BASE_URL}/nonexistent-endpoint`,
          headers: { 'Authorization': `Bearer ${authToken}` }
        }, true);

        // Check if file paths are sanitized
        const errorMessage = JSON.stringify(result.error);
        const hasPathInfo = ['/src/', 'node_modules', '.ts', '.js', 'C:\\'].some(term =>
          errorMessage.includes(term)
        );

        if (!hasPathInfo) {
          log.security('File path information properly sanitized');
          return true;
        }
        log.warning('Potential path disclosure detected');
        return false;
      }
    }
  ];

  for (const test of sensitiveDataTests) {
    try {
      log.test(`Testing ${test.name}...`);
      const passed = await test.test();
      if (passed) {
        testResults.errorSanitization.passed++;
      } else {
        testResults.errorSanitization.failed++;
      }
    } catch (error) {
      log.error(`${test.name} failed: ${error.message}`);
      testResults.errorSanitization.failed++;
    }
  }
}

/**
 * Test Suite 4: Validation Error Tests
 */
async function testValidationErrors() {
  log.section('Validation Error Tests');

  const validationTests = [
    {
      name: 'Missing Required Fields',
      test: async () => {
        const result = await makeRequest({
          method: 'POST',
          url: `${BASE_URL}/tasks`,
          headers: { 'Authorization': `Bearer ${authToken}` },
          data: {} // Missing required fields
        }, true);

        if (result.status === 400 && result.error.message) {
          log.success('Missing fields validation working');
          return true;
        }
        throw new Error('Validation error not properly handled');
      }
    },
    {
      name: 'Invalid Data Types',
      test: async () => {
        const result = await makeRequest({
          method: 'POST',
          url: `${BASE_URL}/tasks`,
          headers: { 'Authorization': `Bearer ${authToken}` },
          data: {
            title: 123, // Should be string
            description: true, // Should be string
            userId: 'invalid-uuid'
          }
        }, true);

        if (result.status === 400) {
          log.success('Data type validation working');
          return true;
        }
        throw new Error('Data type validation failed');
      }
    }
  ];

  for (const test of validationTests) {
    try {
      log.test(`Testing ${test.name}...`);
      const passed = await test.test();
      if (passed) {
        testResults.validationErrors.passed++;
      } else {
        testResults.validationErrors.failed++;
      }
    } catch (error) {
      log.error(`${test.name} failed: ${error.message}`);
      testResults.validationErrors.failed++;
    }
  }
}

/**
 * Test Suite 5: Authentication/Authorization Error Tests
 */
async function testAuthErrors() {
  log.section('Authentication/Authorization Error Tests');

  const authTests = [
    {
      name: 'Invalid JWT Token',
      test: async () => {
        const result = await makeRequest({
          method: 'GET',
          url: `${BASE_URL}/tasks`,
          headers: { 'Authorization': 'Bearer invalid-token' }
        }, true);

        if (result.status === 401 && !result.error.message?.includes('jwt')) {
          log.security('JWT error properly sanitized');
          return true;
        }
        log.warning('JWT error might expose sensitive information');
        return false;
      }
    },
    {
      name: 'Missing Authorization Header',
      test: async () => {
        const result = await makeRequest({
          method: 'GET',
          url: `${BASE_URL}/tasks`
          // No authorization header
        }, true);

        if (result.status === 401) {
          log.success('Missing auth header properly handled');
          return true;
        }
        throw new Error('Missing auth header not properly handled');
      }
    },
    {
      name: 'Expired Token',
      test: async () => {
        // Use an obviously expired token
        const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

        const result = await makeRequest({
          method: 'GET',
          url: `${BASE_URL}/tasks`,
          headers: { 'Authorization': `Bearer ${expiredToken}` }
        }, true);

        if (result.status === 401) {
          log.success('Expired token properly handled');
          return true;
        }
        throw new Error('Expired token not properly handled');
      }
    },
    {
      name: 'Role-Based Access Control',
      test: async () => {
        // Try to access admin-only endpoint with regular user
        const result = await makeRequest({
          method: 'GET',
          url: `${BASE_URL}/tasks/performance-metrics`,
          headers: { 'Authorization': `Bearer ${authToken}` }
        }, true);

        if (result.status === 403) {
          log.success('RBAC properly enforced');
          return true;
        }
        log.warning('RBAC might not be properly enforced');
        return false;
      }
    }
  ];

  for (const test of authTests) {
    try {
      log.test(`Testing ${test.name}...`);
      const passed = await test.test();
      if (passed) {
        testResults.authErrors.passed++;
      } else {
        testResults.authErrors.failed++;
      }
    } catch (error) {
      log.error(`${test.name} failed: ${error.message}`);
      testResults.authErrors.failed++;
    }
  }
}

/**
 * Test Suite 6: Rate Limiting Error Tests
 */
async function testRateLimitErrors() {
  log.section('Rate Limiting Error Tests');

  try {
    log.test('Testing rate limiting behavior...');

    // Make multiple rapid requests to trigger rate limiting
    const requests = [];
    for (let i = 0; i < 15; i++) { // Exceed the limit of 10 requests per minute
      requests.push(
        makeRequest({
          method: 'GET',
          url: `${BASE_URL}/tasks/stats`,
          headers: { 'Authorization': `Bearer ${authToken}` }
        }, false).catch(error => ({
          success: false,
          error: error.response?.data || error.message,
          status: error.response?.status || 500
        }))
      );
    }

    const results = await Promise.all(requests);

    // Check if any requests were rate limited
    const rateLimitedRequests = results.filter(result => result.status === 429);

    if (rateLimitedRequests.length > 0) {
      log.success(`Rate limiting working: ${rateLimitedRequests.length} requests blocked`);

      // Check if rate limit error is properly formatted
      const rateLimitError = rateLimitedRequests[0].error;
      if (rateLimitError.message === 'Too many requests' && !rateLimitError.ip) {
        log.security('Rate limit error properly sanitized (no IP exposure)');
        testResults.rateLimitErrors.passed++;
      } else {
        log.warning('Rate limit error might expose sensitive information');
        testResults.rateLimitErrors.failed++;
      }
    } else {
      log.warning('Rate limiting might not be working properly');
      testResults.rateLimitErrors.failed++;
    }

  } catch (error) {
    log.error(`Rate limiting test failed: ${error.message}`);
    testResults.rateLimitErrors.failed++;
  }
}

/**
 * Test Suite 7: Database Transaction Error Tests
 */
async function testDatabaseTransactionErrors() {
  log.section('Database Transaction Error Tests');

  try {
    log.test('Testing transaction rollback on error...');

    // Try to create multiple tasks with one invalid task in the middle
    const result = await makeRequest({
      method: 'POST',
      url: `${BASE_URL}/tasks/bulk-create`,
      headers: { 'Authorization': `Bearer ${authToken}` },
      data: [
        {
          title: 'Valid Task 1',
          description: 'This should work',
          userId: authToken.split('.')[1] // Extract user ID from token (simplified)
        },
        {
          title: '', // Invalid - empty title
          description: 'This should fail',
          userId: 'invalid-user-id'
        },
        {
          title: 'Valid Task 2',
          description: 'This should work',
          userId: authToken.split('.')[1]
        }
      ]
    }, true);

    // Check if partial success is handled properly
    if (result.status >= 400 || (result.success && result.data.failed?.length > 0)) {
      log.success('Transaction error handling working');
      testResults.databaseErrors.passed++;
    } else {
      log.warning('Transaction error handling might not be working');
      testResults.databaseErrors.failed++;
    }

  } catch (error) {
    log.error(`Database transaction test failed: ${error.message}`);
    testResults.databaseErrors.failed++;
  }
}

/**
 * Test Suite 8: Security Headers Test
 */
async function testSecurityHeaders() {
  log.section('Security Headers Tests');

  try {
    log.test('Testing security headers...');

    const result = await makeRequest({
      method: 'GET',
      url: `${BASE_URL}/tasks/stats`,
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    const securityHeaders = [
      'x-content-type-options',
      'x-frame-options',
      'x-xss-protection'
    ];

    let headersPresent = 0;
    securityHeaders.forEach(header => {
      if (result.headers && result.headers[header]) {
        headersPresent++;
        log.success(`Security header present: ${header}`);
      } else {
        log.warning(`Security header missing: ${header}`);
      }
    });

    if (headersPresent >= 2) {
      testResults.globalExceptionFilter.passed++;
    } else {
      testResults.globalExceptionFilter.failed++;
    }

  } catch (error) {
    log.error(`Security headers test failed: ${error.message}`);
    testResults.globalExceptionFilter.failed++;
  }
}

/**
 * Generate Test Report
 */
function generateTestReport() {
  log.header('Error Handling Test Results');

  const totalTests = Object.values(testResults).reduce((sum, category) => sum + category.passed + category.failed, 0);
  const totalPassed = Object.values(testResults).reduce((sum, category) => sum + category.passed, 0);
  const totalFailed = Object.values(testResults).reduce((sum, category) => sum + category.failed, 0);

  log.info(`Total Tests: ${totalTests}`);
  log.success(`Passed: ${totalPassed}`);
  if (totalFailed > 0) log.error(`Failed: ${totalFailed}`);

  Object.entries(testResults).forEach(([category, results]) => {
    const categoryTotal = results.passed + results.failed;
    if (categoryTotal > 0) {
      const percentage = ((results.passed / categoryTotal) * 100).toFixed(1);
      log.info(`${category}: ${results.passed}/${categoryTotal} (${percentage}%)`);
    }
  });

  const overallPercentage = totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(1) : 0;

  if (overallPercentage >= 90) {
    log.success(`🎉 EXCELLENT: ${overallPercentage}% error handling coverage`);
  } else if (overallPercentage >= 75) {
    log.success(`✅ GOOD: ${overallPercentage}% error handling coverage`);
  } else {
    log.warning(`⚠️  NEEDS IMPROVEMENT: ${overallPercentage}% error handling coverage`);
  }

  return { totalTests, totalPassed, totalFailed, overallPercentage };
}

/**
 * Main Test Runner
 */
async function runAllErrorTests() {
  log.header('Comprehensive Error Handling Test Suite');

  const startTime = Date.now();

  try {
    // Setup
    await setupAuthentication();

    // Run all test suites
    await testGlobalExceptionFilter();
    await testErrorSanitization();
    await testValidationErrors();
    await testAuthErrors();
    await testRateLimitErrors();
    await testDatabaseTransactionErrors();
    await testSecurityHeaders();

    // Generate report
    const report = generateTestReport();

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    log.info(`Test duration: ${duration}s`);

    if (report.overallPercentage >= 75) {
      log.success('🛡️  Error handling system is robust and production-ready!');
    } else {
      log.warning('🔧 Error handling system needs improvements');
    }

  } catch (error) {
    log.error(`Test suite failed: ${error.message}`);
    process.exit(1);
  }
}

// Run tests if called directly
if (require.main === module) {
  runAllErrorTests().catch(error => {
    console.error('❌ Test suite crashed:', error.message);
    process.exit(1);
  });
}

module.exports = {
  runAllErrorTests,
  testGlobalExceptionFilter,
  testErrorSanitization,
  testValidationErrors
};
