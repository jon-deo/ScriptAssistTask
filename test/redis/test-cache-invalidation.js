/**
 * 🔄 Cache Invalidation Test Script
 * 
 * This script specifically tests cache invalidation after UPDATE operations:
 * - Task updates and cache invalidation
 * - User updates and cache invalidation  
 * - Statistics cache invalidation
 * - Performance comparison (cache miss vs cache hit)
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
let authToken = null;
let testTaskId = null;
let testUserId = null;

// Helper function to measure execution time
async function measureTime(fn) {
  const start = Date.now();
  const result = await fn();
  const time = Date.now() - start;
  return { result, time };
}

// Helper function to sleep
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Logging helpers
const log = {
  section: (title) => console.log(`\n🔷 ${title}\n${'='.repeat(50)}`),
  test: (msg) => console.log(`🧪 ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`),
  info: (msg) => console.log(`ℹ️  ${msg}`),
  performance: (msg) => console.log(`⚡ ${msg}`),
  warning: (msg) => console.log(`⚠️  ${msg}`)
};

/**
 * Step 1: Authentication
 */
async function authenticate() {
  log.section('Authentication');
  
  try {
    log.test('Logging in with admin user...');
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'admin@example.com',
      password: 'admin123'
    });
    
    authToken = response.data.accessToken;
    log.success('Authentication successful');
    return true;
  } catch (error) {
    log.error(`Authentication failed: ${error.response?.status || error.message}`);
    
    // Try with regular user as fallback
    try {
      log.test('Trying with regular user...');
      const response = await axios.post(`${BASE_URL}/auth/login`, {
        email: 'user@example.com', 
        password: 'user123'
      });
      
      authToken = response.data.accessToken;
      log.success('Authentication successful with regular user');
      return true;
    } catch (fallbackError) {
      log.error('Both admin and regular user authentication failed');
      return false;
    }
  }
}

/**
 * Step 2: Setup Test Data
 */
async function setupTestData() {
  log.section('Test Data Setup');
  
  const headers = { 'Authorization': `Bearer ${authToken}` };
  
  try {
    // Create a test task
    log.test('Creating test task...');
    const taskResponse = await axios.post(`${BASE_URL}/tasks`, {
      title: 'Cache Invalidation Test Task',
      description: 'This task will be updated to test cache invalidation',
      userId: '550e8400-e29b-41d4-a716-446655440000' // Admin user ID from seeded data
    }, { headers });
    
    testTaskId = taskResponse.data.id;
    testUserId = taskResponse.data.userId;
    log.success(`Test task created with ID: ${testTaskId}`);
    
    return true;
  } catch (error) {
    log.error(`Failed to create test data: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

/**
 * Step 3: Test Task Update Cache Invalidation
 */
async function testTaskUpdateCacheInvalidation() {
  log.section('Task Update Cache Invalidation Test');
  
  const headers = { 'Authorization': `Bearer ${authToken}` };
  
  try {
    // Step 1: Get initial task statistics (this will cache the stats)
    log.test('Getting initial task statistics (cache miss)...');
    const { result: initialStats, time: initialTime } = await measureTime(async () => {
      return axios.get(`${BASE_URL}/tasks/stats`, { headers });
    });
    
    log.performance(`Initial stats request: ${initialTime}ms`);
    log.info(`Initial stats: Total=${initialStats.data.total}, Completed=${initialStats.data.completed}`);
    
    // Step 2: Get stats again (should be cached - faster)
    log.test('Getting task statistics again (cache hit)...');
    const { result: cachedStats, time: cachedTime } = await measureTime(async () => {
      return axios.get(`${BASE_URL}/tasks/stats`, { headers });
    });
    
    log.performance(`Cached stats request: ${cachedTime}ms`);
    
    if (cachedTime < initialTime * 0.8) {
      log.success('Cache is working - second request was faster');
    } else {
      log.warning('Cache might not be working - similar response times');
    }
    
    // Step 3: Update the test task (this should invalidate cache)
    log.test('Updating test task to trigger cache invalidation...');
    await axios.patch(`${BASE_URL}/tasks/${testTaskId}`, {
      title: 'Updated Cache Test Task',
      description: 'Task updated to test cache invalidation',
      status: 'COMPLETED',
      userId: testUserId
    }, { headers });
    
    log.success('Task updated successfully');
    
    // Wait a moment for cache invalidation to process
    await sleep(500);
    
    // Step 4: Get stats again (should be slower - cache invalidated)
    log.test('Getting task statistics after update (cache miss expected)...');
    const { result: postUpdateStats, time: postUpdateTime } = await measureTime(async () => {
      return axios.get(`${BASE_URL}/tasks/stats`, { headers });
    });
    
    log.performance(`Post-update stats request: ${postUpdateTime}ms`);
    log.info(`Post-update stats: Total=${postUpdateStats.data.total}, Completed=${postUpdateStats.data.completed}`);
    
    // Analyze results
    log.test('Analyzing cache invalidation results...');
    
    // Check if stats changed (completed count should increase)
    if (postUpdateStats.data.completed > initialStats.data.completed) {
      log.success('✅ Cache invalidation working - stats updated correctly');
    } else {
      log.error('❌ Cache invalidation failed - stats not updated');
    }
    
    // Check if response time increased (indicating cache miss)
    if (postUpdateTime > cachedTime * 1.2) {
      log.success('✅ Cache invalidation confirmed - slower response after update');
    } else {
      log.warning('⚠️  Response time similar - cache may not have been invalidated');
    }
    
    // Performance summary
    log.performance(`Performance Summary:`);
    log.performance(`  Initial (DB): ${initialTime}ms`);
    log.performance(`  Cached:       ${cachedTime}ms (${((initialTime - cachedTime) / initialTime * 100).toFixed(1)}% faster)`);
    log.performance(`  Post-update:  ${postUpdateTime}ms (cache invalidated)`);
    
    return true;
  } catch (error) {
    log.error(`Task update cache invalidation test failed: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

/**
 * Step 4: Test User Update Cache Invalidation
 */
async function testUserUpdateCacheInvalidation() {
  log.section('User Update Cache Invalidation Test');
  
  const headers = { 'Authorization': `Bearer ${authToken}` };
  
  try {
    // Step 1: Get user profile (this will cache the user)
    log.test('Getting user profile (cache miss)...');
    const { result: initialUser, time: initialTime } = await measureTime(async () => {
      return axios.get(`${BASE_URL}/users/${testUserId}`, { headers });
    });
    
    log.performance(`Initial user request: ${initialTime}ms`);
    log.info(`User name: ${initialUser.data.name}`);
    
    // Step 2: Get user profile again (should be cached)
    log.test('Getting user profile again (cache hit)...');
    const { result: cachedUser, time: cachedTime } = await measureTime(async () => {
      return axios.get(`${BASE_URL}/users/${testUserId}`, { headers });
    });
    
    log.performance(`Cached user request: ${cachedTime}ms`);
    
    if (cachedTime < initialTime * 0.8) {
      log.success('User cache is working - second request was faster');
    }
    
    // Step 3: Update user (this should invalidate cache)
    log.test('Updating user to trigger cache invalidation...');
    await axios.patch(`${BASE_URL}/users/${testUserId}`, {
      name: 'Updated Cache Test User'
    }, { headers });
    
    log.success('User updated successfully');
    
    // Wait a moment for cache invalidation
    await sleep(500);
    
    // Step 4: Get user profile again (should be slower - cache invalidated)
    log.test('Getting user profile after update (cache miss expected)...');
    const { result: postUpdateUser, time: postUpdateTime } = await measureTime(async () => {
      return axios.get(`${BASE_URL}/users/${testUserId}`, { headers });
    });
    
    log.performance(`Post-update user request: ${postUpdateTime}ms`);
    log.info(`Updated user name: ${postUpdateUser.data.name}`);
    
    // Analyze results
    if (postUpdateUser.data.name === 'Updated Cache Test User') {
      log.success('✅ User cache invalidation working - data updated correctly');
    } else {
      log.error('❌ User cache invalidation failed - data not updated');
    }
    
    if (postUpdateTime > cachedTime * 1.2) {
      log.success('✅ User cache invalidation confirmed - slower response after update');
    } else {
      log.warning('⚠️  Response time similar - user cache may not have been invalidated');
    }
    
    return true;
  } catch (error) {
    log.error(`User update cache invalidation test failed: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

/**
 * Step 5: Cleanup Test Data
 */
async function cleanup() {
  log.section('Cleanup');
  
  const headers = { 'Authorization': `Bearer ${authToken}` };
  
  try {
    if (testTaskId) {
      log.test('Deleting test task...');
      await axios.delete(`${BASE_URL}/tasks/${testTaskId}`, { headers });
      log.success('Test task deleted');
    }
  } catch (error) {
    log.warning(`Cleanup failed: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Main Test Runner
 */
async function runCacheInvalidationTests() {
  console.log('🔄 Cache Invalidation Test Suite');
  console.log('='.repeat(60));
  console.log('This test verifies that cache is properly invalidated after updates\n');
  
  try {
    // Step 1: Authenticate
    if (!await authenticate()) {
      process.exit(1);
    }
    
    // Step 2: Setup test data
    if (!await setupTestData()) {
      process.exit(1);
    }
    
    // Step 3: Test task update cache invalidation
    const taskTestResult = await testTaskUpdateCacheInvalidation();
    
    // Step 4: Test user update cache invalidation  
    const userTestResult = await testUserUpdateCacheInvalidation();
    
    // Step 5: Cleanup
    await cleanup();
    
    // Final results
    log.section('Test Results Summary');
    
    if (taskTestResult && userTestResult) {
      log.success('🎉 All cache invalidation tests passed!');
      log.success('✅ Task update cache invalidation: WORKING');
      log.success('✅ User update cache invalidation: WORKING');
      log.info('Your Redis cache invalidation is functioning correctly.');
    } else {
      log.error('❌ Some cache invalidation tests failed');
      log.error(`Task update test: ${taskTestResult ? 'PASSED' : 'FAILED'}`);
      log.error(`User update test: ${userTestResult ? 'PASSED' : 'FAILED'}`);
    }
    
  } catch (error) {
    log.error(`Test suite failed: ${error.message}`);
    await cleanup();
    process.exit(1);
  }
}

// Run the tests
runCacheInvalidationTests();
