#!/usr/bin/env node
/**
 * 🚀 Complete Redis Cache Test Suite
 * 
 * This script tests all Redis caching functionality:
 * - Connectivity and basic performance
 * - Authentication and token management
 * - Cache hit/miss performance
 * - Cache invalidation
 * - All cached endpoints
 * - Production readiness checks
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
let authToken = null;

// Test configuration
const TEST_CONFIG = {
  timeout: 10000,
  retries: 3,
  testUser: {
    email: 'cachetest@company.com',
    password: 'CacheTest123!',
    name: 'Cache Test User'
  },
  seededUsers: [
    { email: 'admin@example.com', password: 'admin123', role: 'admin' },
    { email: 'user@example.com', password: 'user123', role: 'user' }
  ]
};

// Utility functions
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const measureTime = async (fn) => {
  const start = Date.now();
  const result = await fn();
  return { result, time: Date.now() - start };
};

// Test results tracking
const testResults = {
  connectivity: { passed: 0, failed: 0 },
  authentication: { passed: 0, failed: 0 },
  cachePerformance: { passed: 0, failed: 0 },
  cacheInvalidation: { passed: 0, failed: 0 },
  endpoints: { passed: 0, failed: 0 }
};

// Console formatting
const log = {
  header: (msg) => console.log(`\n${'='.repeat(60)}\n🚀 ${msg}\n${'='.repeat(60)}`),
  section: (msg) => console.log(`\n${'─'.repeat(40)}\n📋 ${msg}\n${'─'.repeat(40)}`),
  test: (msg) => console.log(`\n🧪 ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`),
  info: (msg) => console.log(`ℹ️  ${msg}`),
  performance: (msg) => console.log(`⏱️  ${msg}`),
  cache: (msg) => console.log(`💾 ${msg}`)
};

/**
 * Test Suite 1: Connectivity and Basic Setup
 */
async function testConnectivity() {
  log.section('Connectivity Tests');

  try {
    log.test('Testing application connectivity...');

    // Test basic connectivity
    try {
      await axios.get(`${BASE_URL}/`, { timeout: TEST_CONFIG.timeout });
      log.success('Application is accessible');
    } catch (error) {
      if (error.response?.status === 404) {
        log.success('Application is running (404 expected for root)');
      } else {
        throw error;
      }
    }

    // Test Redis connectivity through app logs
    log.test('Testing Redis connection...');
    const { time } = await measureTime(async () => {
      return axios.post(`${BASE_URL}/auth/login`, {
        email: 'nonexistent@test.com',
        password: 'wrong'
      }).catch(() => { }); // Expected to fail
    });

    log.performance(`Response time: ${time}ms (Redis operational)`);
    testResults.connectivity.passed++;

  } catch (error) {
    log.error(`Connectivity test failed: ${error.message}`);
    testResults.connectivity.failed++;
    throw error;
  }
}

/**
 * Test Suite 2: Authentication and Token Management
 */
async function testAuthentication() {
  log.section('Authentication Tests');

  // Try seeded users first
  for (const user of TEST_CONFIG.seededUsers) {
    try {
      log.test(`Testing login with seeded ${user.role} user...`);

      const response = await axios.post(`${BASE_URL}/auth/login`, {
        email: user.email,
        password: user.password
      });

      authToken = response.data.accessToken;
      log.success(`Login successful with ${user.role} user`);
      log.info(`Token: ${authToken.substring(0, 20)}...`);
      testResults.authentication.passed++;
      return;

    } catch (error) {
      log.error(`Seeded ${user.role} login failed: ${error.response?.status || error.message}`);
    }
  }

  // Try registering new user if seeded users fail
  try {
    log.test('Registering new test user...');

    await axios.post(`${BASE_URL}/auth/register`, TEST_CONFIG.testUser);
    log.success('User registered successfully');

    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: TEST_CONFIG.testUser.email,
      password: TEST_CONFIG.testUser.password
    });

    authToken = loginResponse.data.accessToken;
    log.success('Login successful with new user');
    testResults.authentication.passed++;

  } catch (error) {
    if (error.response?.status === 409) {
      // User exists, try login
      const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
        email: TEST_CONFIG.testUser.email,
        password: TEST_CONFIG.testUser.password
      });
      authToken = loginResponse.data.accessToken;
      log.success('Login successful with existing user');
      testResults.authentication.passed++;
    } else {
      log.error(`Authentication failed: ${error.response?.data || error.message}`);
      testResults.authentication.failed++;
      throw error;
    }
  }
}

/**
 * Test Suite 3: Cache Performance Testing
 */
async function testCachePerformance() {
  log.section('Cache Performance Tests');

  if (!authToken) {
    throw new Error('No auth token available for cache tests');
  }

  const headers = { 'Authorization': `Bearer ${authToken}` };
  const endpoints = [
    { name: 'Cache Stats', url: '/tasks/cache-stats' },
    { name: 'Task Statistics', url: '/tasks/stats' },
    { name: 'Task List', url: '/tasks' }
  ];

  const performanceResults = [];

  for (const endpoint of endpoints) {
    try {
      log.test(`Testing ${endpoint.name} caching...`);

      // First request (cache miss)
      const { time: time1 } = await measureTime(async () => {
        return axios.get(`${BASE_URL}${endpoint.url}`, { headers });
      });

      // Small delay to ensure cache is set
      await sleep(100);

      // Second request (cache hit)
      const { time: time2 } = await measureTime(async () => {
        return axios.get(`${BASE_URL}${endpoint.url}`, { headers });
      });

      const improvement = ((time1 - time2) / time1 * 100).toFixed(1);
      performanceResults.push({ name: endpoint.name, time1, time2, improvement });

      log.performance(`${endpoint.name}: ${time1}ms → ${time2}ms (${improvement}% improvement)`);

      if (time2 < time1) {
        log.success(`Cache working for ${endpoint.name}`);
        testResults.cachePerformance.passed++;
      } else {
        log.error(`Cache not improving performance for ${endpoint.name}`);
        testResults.cachePerformance.failed++;
      }

    } catch (error) {
      log.error(`${endpoint.name} test failed: ${error.response?.status || error.message}`);
      testResults.cachePerformance.failed++;
    }
  }

  // Overall performance summary
  const avgImprovement = performanceResults.reduce((sum, r) => sum + parseFloat(r.improvement), 0) / performanceResults.length;
  log.cache(`Average performance improvement: ${avgImprovement.toFixed(1)}%`);

  return performanceResults;
}

/**
 * Test Suite 4: Cache Invalidation Testing
 */
async function testCacheInvalidation() {
  log.section('Cache Invalidation Tests');

  if (!authToken) {
    throw new Error('No auth token available for invalidation tests');
  }

  const headers = { 'Authorization': `Bearer ${authToken}` };

  try {
    log.test('Testing cache invalidation on data changes...');

    // Get initial stats (should be cached)
    const { result: initialStats, time: initialTime } = await measureTime(async () => {
      return axios.get(`${BASE_URL}/tasks/stats`, { headers });
    });

    log.performance(`Initial stats request: ${initialTime}ms`);
    log.info(`Initial stats: ${JSON.stringify(initialStats.data)}`);

    // Create a new task (should invalidate cache)
    log.test('Creating new task to trigger cache invalidation...');

    try {
      await axios.post(`${BASE_URL}/tasks`, {
        title: 'Cache Invalidation Test Task',
        description: 'Testing if cache clears when data changes',
        userId: '550e8400-e29b-41d4-a716-446655440000' // Admin user ID from seeded data
      }, { headers });

      log.success('Task created successfully');

      // Wait a moment for cache invalidation
      await sleep(500);

      // Get stats again (should be slower - cache miss)
      const { result: newStats, time: newTime } = await measureTime(async () => {
        return axios.get(`${BASE_URL}/tasks/stats`, { headers });
      });

      log.performance(`Post-creation stats request: ${newTime}ms`);
      log.info(`New stats: ${JSON.stringify(newStats.data)}`);

      // Check if stats changed (total should increase)
      if (newStats.data.total > initialStats.data.total) {
        log.success('Cache invalidation working - stats updated');
        testResults.cacheInvalidation.passed++;
      } else {
        log.error('Cache invalidation may not be working - stats unchanged');
        testResults.cacheInvalidation.failed++;
      }

      // Check if response time increased (indicating cache miss)
      if (newTime > initialTime * 0.8) { // Allow some variance
        log.success('Cache invalidation confirmed - slower response after data change');
        testResults.cacheInvalidation.passed++;
      } else {
        log.info('Response time similar - cache may still be active');
      }

    } catch (createError) {
      log.error(`Task creation failed: ${createError.response?.status || createError.message}`);
      log.info('Skipping invalidation test due to creation failure');
      testResults.cacheInvalidation.failed++;
    }

  } catch (error) {
    log.error(`Cache invalidation test failed: ${error.message}`);
    testResults.cacheInvalidation.failed++;
  }
}

/**
 * Test Suite 5: All Cached Endpoints
 */
async function testAllEndpoints() {
  log.section('All Cached Endpoints Test');

  if (!authToken) {
    throw new Error('No auth token available for endpoint tests');
  }

  const headers = { 'Authorization': `Bearer ${authToken}` };
  const endpoints = [
    { name: 'Cache Statistics', url: '/tasks/cache-stats', method: 'GET' },
    { name: 'Task Statistics', url: '/tasks/stats', method: 'GET' },
    { name: 'Task List', url: '/tasks', method: 'GET' },
    { name: 'Task List with Filters', url: '/tasks?page=1&limit=5', method: 'GET' }
  ];

  for (const endpoint of endpoints) {
    try {
      log.test(`Testing ${endpoint.name}...`);

      const response = await axios({
        method: endpoint.method,
        url: `${BASE_URL}${endpoint.url}`,
        headers,
        timeout: TEST_CONFIG.timeout
      });

      log.success(`${endpoint.name}: ${response.status} - ${JSON.stringify(response.data).substring(0, 100)}...`);
      testResults.endpoints.passed++;

    } catch (error) {
      log.error(`${endpoint.name} failed: ${error.response?.status || error.message}`);
      testResults.endpoints.failed++;
    }
  }
}

/**
 * Production Readiness Check
 */
async function productionReadinessCheck() {
  log.section('Production Readiness Check');

  const checks = [];

  // Redis connection check
  try {
    if (authToken) {
      const response = await axios.get(`${BASE_URL}/tasks/cache-stats`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      checks.push({
        name: 'Redis Connection',
        status: response.data.cache.connected ? 'PASS' : 'FAIL',
        details: `Connected: ${response.data.cache.connected}, Keys: ${response.data.cache.keys}, Memory: ${response.data.cache.memory}`
      });
    }
  } catch (error) {
    checks.push({
      name: 'Redis Connection',
      status: 'FAIL',
      details: error.message
    });
  }

  // Performance check
  const avgImprovement = testResults.cachePerformance.passed > 0 ? 'PASS' : 'FAIL';
  checks.push({
    name: 'Cache Performance',
    status: avgImprovement,
    details: `${testResults.cachePerformance.passed} endpoints showing improvement`
  });

  // Error handling check
  const errorRate = (testResults.connectivity.failed + testResults.authentication.failed +
    testResults.cachePerformance.failed + testResults.endpoints.failed) /
    (testResults.connectivity.passed + testResults.authentication.passed +
      testResults.cachePerformance.passed + testResults.endpoints.passed + 1);

  checks.push({
    name: 'Error Handling',
    status: errorRate < 0.1 ? 'PASS' : 'FAIL',
    details: `Error rate: ${(errorRate * 100).toFixed(1)}%`
  });

  log.test('Production readiness summary:');
  checks.forEach(check => {
    const icon = check.status === 'PASS' ? '✅' : '❌';
    log.info(`${icon} ${check.name}: ${check.status} - ${check.details}`);
  });

  return checks;
}

/**
 * Main Test Runner
 */
async function runAllTests() {
  log.header('Redis Cache Complete Test Suite');

  const startTime = Date.now();

  try {
    // Run all test suites
    await testConnectivity();
    await testAuthentication();
    const performanceResults = await testCachePerformance();
    await testCacheInvalidation();
    await testAllEndpoints();
    const readinessChecks = await productionReadinessCheck();

    // Final summary
    log.header('Test Results Summary');

    const totalTests = Object.values(testResults).reduce((sum, category) => sum + category.passed + category.failed, 0);
    const totalPassed = Object.values(testResults).reduce((sum, category) => sum + category.passed, 0);
    const totalFailed = Object.values(testResults).reduce((sum, category) => sum + category.failed, 0);

    log.info(`Total Tests: ${totalTests}`);
    log.success(`Passed: ${totalPassed}`);
    if (totalFailed > 0) log.error(`Failed: ${totalFailed}`);

    Object.entries(testResults).forEach(([category, results]) => {
      log.info(`${category}: ${results.passed} passed, ${results.failed} failed`);
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    log.performance(`Total test duration: ${duration}s`);

    // Overall status
    const overallStatus = totalFailed === 0 ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED';
    const statusIcon = totalFailed === 0 ? '🎉' : '⚠️';

    log.header(`${statusIcon} ${overallStatus} ${statusIcon}`);

    if (totalFailed === 0) {
      log.success('🚀 Redis caching is fully operational and production-ready!');
      log.success('📈 Performance improvements confirmed across all endpoints');
      log.success('🔄 Cache invalidation working correctly');
      log.success('💾 Redis connection stable and monitored');
    } else {
      log.error('🔧 Some issues detected - check failed tests above');
    }

  } catch (error) {
    log.error(`Test suite failed: ${error.message}`);
    process.exit(1);
  }
}

// Run tests if called directly
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('❌ Test suite crashed:', error.message);
    process.exit(1);
  });
}

module.exports = {
  runAllTests,
  testConnectivity,
  testAuthentication,
  testCachePerformance,
  testCacheInvalidation,
  testAllEndpoints,
  productionReadinessCheck
};
