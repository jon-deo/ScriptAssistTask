#!/usr/bin/env node
/**
 * 🧪 Manual Error Testing Script
 * 
 * Quick manual tests for error handling verification
 */

const axios = require('axios');

// Set timeout for axios requests
axios.defaults.timeout = 10000;

const BASE_URL = 'http://localhost:3000';

// Console formatting
const log = {
  header: (msg) => console.log(`\n${'='.repeat(50)}\n🧪 ${msg}\n${'='.repeat(50)}`),
  test: (msg) => console.log(`\n🔬 ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`),
  info: (msg) => console.log(`ℹ️  ${msg}`),
  security: (msg) => console.log(`🛡️  ${msg}`)
};

/**
 * Test 1: Authentication Errors
 */
async function testAuthErrors() {
  log.header('Authentication Error Tests');

  // Test 1.1: No Authorization Header
  log.test('Testing missing authorization header...');
  try {
    await axios.get(`${BASE_URL}/tasks`);
    log.error('Should have failed with 401');
  } catch (error) {
    if (error.response?.status === 401) {
      log.success('Missing auth header properly rejected');
      log.info(`Response: ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      log.error(`Unexpected status: ${error.response?.status}`);
    }
  }

  // Test 1.2: Invalid Token
  log.test('Testing invalid JWT token...');
  try {
    await axios.get(`${BASE_URL}/tasks`, {
      headers: { 'Authorization': 'Bearer invalid-token-here' }
    });
    log.error('Should have failed with 401');
  } catch (error) {
    if (error.response?.status === 401) {
      log.success('Invalid token properly rejected');
      log.info(`Response: ${JSON.stringify(error.response.data, null, 2)}`);

      // Check if JWT details are sanitized
      const errorMessage = JSON.stringify(error.response.data).toLowerCase();
      if (!errorMessage.includes('jwt') && !errorMessage.includes('token')) {
        log.security('JWT error properly sanitized');
      } else {
        log.error('JWT error might expose sensitive information');
      }
    } else {
      log.error(`Unexpected status: ${error.response?.status}`);
    }
  }
}

/**
 * Test 2: Validation Errors
 */
async function testValidationErrors() {
  log.header('Validation Error Tests');

  // First, get a valid token
  let authToken = null;
  try {
    log.test('Getting auth token...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'admin@example.com',
      password: 'admin123'
    });
    authToken = loginResponse.data.accessToken;
    log.success('Auth token obtained');
  } catch (error) {
    log.error('Failed to get auth token. Make sure the app is running and seeded.');
    return;
  }

  // Test 2.1: Missing Required Fields
  log.test('Testing missing required fields...');
  try {
    await axios.post(`${BASE_URL}/tasks`, {}, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    log.error('Should have failed with validation error');
  } catch (error) {
    if (error.response?.status === 400) {
      log.success('Missing fields validation working');
      log.info(`Response: ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      log.error(`Unexpected status: ${error.response?.status}`);
    }
  }

  // Test 2.2: Invalid Data Types
  log.test('Testing invalid data types...');
  try {
    await axios.post(`${BASE_URL}/tasks`, {
      title: 123, // Should be string
      description: true, // Should be string
      userId: 'not-a-uuid'
    }, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    log.error('Should have failed with validation error');
  } catch (error) {
    if (error.response?.status === 400) {
      log.success('Data type validation working');
      log.info(`Response: ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      log.error(`Unexpected status: ${error.response?.status}`);
    }
  }

  // Test 2.3: SQL Injection Attempt
  log.test('Testing SQL injection protection...');
  try {
    await axios.get(`${BASE_URL}/tasks?status='; DROP TABLE tasks; --`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    log.success('SQL injection attempt handled (no error thrown)');
  } catch (error) {
    log.info(`SQL injection blocked with status: ${error.response?.status}`);

    // Check if SQL-related terms are sanitized
    const errorMessage = JSON.stringify(error.response?.data).toLowerCase();
    const hasSensitiveInfo = ['sql', 'drop', 'table', 'database', 'query'].some(term =>
      errorMessage.includes(term)
    );

    if (!hasSensitiveInfo) {
      log.security('SQL injection error properly sanitized');
    } else {
      log.error('Potential SQL information disclosure detected');
    }

    log.info(`Response: ${JSON.stringify(error.response?.data, null, 2)}`);
  }
}

/**
 * Test 3: Rate Limiting
 */
async function testRateLimiting() {
  log.header('Rate Limiting Tests');

  // Get auth token
  let authToken = null;
  try {
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'admin@example.com',
      password: 'admin123'
    });
    authToken = loginResponse.data.accessToken;
  } catch (error) {
    log.error('Failed to get auth token');
    return;
  }

  log.test('Testing rate limiting (making 15 rapid requests)...');

  const requests = [];
  for (let i = 0; i < 15; i++) {
    requests.push(
      axios.get(`${BASE_URL}/tasks/stats`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      }).catch(error => ({
        status: error.response?.status,
        data: error.response?.data
      }))
    );
  }

  try {
    const results = await Promise.all(requests);

    const rateLimitedRequests = results.filter(result => result.status === 429);

    if (rateLimitedRequests.length > 0) {
      log.success(`Rate limiting working: ${rateLimitedRequests.length} requests blocked`);

      // Check rate limit error format
      const rateLimitError = rateLimitedRequests[0].data;
      log.info(`Rate limit response: ${JSON.stringify(rateLimitError, null, 2)}`);

      // Check if IP is exposed
      if (!JSON.stringify(rateLimitError).includes('ip')) {
        log.security('Rate limit error properly sanitized (no IP exposure)');
      } else {
        log.error('Rate limit error might expose IP address');
      }
    } else {
      log.error('Rate limiting might not be working properly');
    }
  } catch (error) {
    log.error(`Rate limiting test failed: ${error.message}`);
  }
}

/**
 * Test 4: Database Errors
 */
async function testDatabaseErrors() {
  log.header('Database Error Tests');

  // Get auth token
  let authToken = null;
  try {
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'admin@example.com',
      password: 'admin123'
    });
    authToken = loginResponse.data.accessToken;
  } catch (error) {
    log.error('Failed to get auth token');
    return;
  }

  // Test 4.1: Invalid UUID
  log.test('Testing invalid UUID handling...');
  try {
    await axios.get(`${BASE_URL}/tasks/invalid-uuid-format`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    log.error('Should have failed with error');
  } catch (error) {
    log.success(`Invalid UUID handled with status: ${error.response?.status}`);
    log.info(`Response: ${JSON.stringify(error.response?.data, null, 2)}`);

    // Check if database details are sanitized
    const errorMessage = JSON.stringify(error.response?.data).toLowerCase();
    const hasDatabaseInfo = ['database', 'sql', 'query', 'table', 'typeorm'].some(term =>
      errorMessage.includes(term)
    );

    if (!hasDatabaseInfo) {
      log.security('Database error properly sanitized');
    } else {
      log.error('Potential database information disclosure detected');
    }
  }

  // Test 4.2: Non-existent Resource
  log.test('Testing non-existent resource...');
  try {
    await axios.get(`${BASE_URL}/tasks/550e8400-e29b-41d4-a716-446655440999`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    log.error('Should have failed with 404');
  } catch (error) {
    if (error.response?.status === 404) {
      log.success('Non-existent resource properly handled');
      log.info(`Response: ${JSON.stringify(error.response?.data, null, 2)}`);
    } else {
      log.error(`Unexpected status: ${error.response?.status}`);
    }
  }
}

/**
 * Test 5: Security Headers
 */
async function testSecurityHeaders() {
  log.header('Security Headers Tests');

  log.test('Testing security headers...');
  try {
    const response = await axios.get(`${BASE_URL}/auth/login`, {
      validateStatus: () => true // Don't throw on any status
    });

    const securityHeaders = [
      'x-content-type-options',
      'x-frame-options',
      'x-xss-protection'
    ];

    log.info('Checking security headers:');
    securityHeaders.forEach(header => {
      if (response.headers[header]) {
        log.success(`✓ ${header}: ${response.headers[header]}`);
      } else {
        log.error(`✗ ${header}: Missing`);
      }
    });

  } catch (error) {
    log.error(`Security headers test failed: ${error.message}`);
  }
}

/**
 * Main Test Runner
 */
async function runManualErrorTests() {
  log.header('Manual Error Handling Tests');

  console.log('🚀 Starting manual error handling tests...');
  console.log('📝 Make sure your application is running on http://localhost:3000');
  console.log('📝 Make sure the database is seeded with admin user');

  try {
    await testAuthErrors();
    await testValidationErrors();
    await testRateLimiting();
    await testDatabaseErrors();
    await testSecurityHeaders();

    log.header('Manual Tests Completed');
    log.success('🎉 All manual error tests completed!');
    log.info('📊 Review the output above to verify error handling behavior');

  } catch (error) {
    log.error(`Manual tests failed: ${error.message}`);
  }
}

// Run tests
runManualErrorTests().catch(error => {
  console.error('❌ Manual test suite crashed:', error.message);
  process.exit(1);
});
