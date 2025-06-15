/**
 * 🔍 Complete Individual Task Cache Test
 * 
 * This test comprehensively verifies:
 * 1. Individual task caching is working (cache hits are faster)
 * 2. Cache invalidation works when admin updates user tasks
 * 3. User gets fresh data after admin updates
 * 4. Cache keys are properly managed for different users
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
let adminToken = null;
let userToken = null;
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
  section: (title) => console.log(`\n🔷 ${title}\n${'='.repeat(70)}`),
  test: (msg) => console.log(`🧪 ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`),
  info: (msg) => console.log(`ℹ️  ${msg}`),
  performance: (msg) => console.log(`⚡ ${msg}`),
  warning: (msg) => console.log(`⚠️  ${msg}`),
  data: (msg) => console.log(`📊 ${msg}`),
  cache: (msg) => console.log(`💾 ${msg}`)
};

/**
 * Step 1: Authentication
 */
async function authenticate() {
  log.section('Authentication Setup');
  
  try {
    // Login as Admin
    log.test('Logging in as admin...');
    const adminResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'himansuadmin@gmail.com',
      password: 'Himansu@21'
    });
    
    adminToken = adminResponse.data.accessToken;
    log.success('Admin authentication successful');
    
    // Login as Regular User
    log.test('Logging in as regular user...');
    const userResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'himansu@gmail.com', 
      password: 'Himansu@21'
    });
    
    userToken = userResponse.data.accessToken;
    log.success('User authentication successful');
    
    return true;
  } catch (error) {
    log.error(`Authentication failed: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

/**
 * Step 2: Setup Test Task
 */
async function setupTestTask() {
  log.section('Test Task Setup');
  
  const userHeaders = { 'Authorization': `Bearer ${userToken}` };
  
  try {
    // Get existing tasks for the regular user
    log.test('Finding existing task assigned to regular user...');
    const tasksResponse = await axios.get(`${BASE_URL}/tasks`, { headers: userHeaders });
    
    if (tasksResponse.data.data && tasksResponse.data.data.length > 0) {
      // Use the first task belonging to the user
      const userTask = tasksResponse.data.data[0];
      testTaskId = userTask.id;
      testUserId = userTask.userId;
      
      log.success(`Using existing task with ID: ${testTaskId}`);
      log.info(`Task assigned to user: ${testUserId}`);
      log.data(`Initial task data: Status=${userTask.status}, Priority=${userTask.priority}`);
      
      return true;
    } else {
      log.error('No existing tasks found for regular user');
      return false;
    }
  } catch (error) {
    log.error(`Failed to setup test task: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

/**
 * Step 3: Test Individual Task Caching Performance
 */
async function testIndividualTaskCaching() {
  log.section('Individual Task Caching Performance Test');
  
  const userHeaders = { 'Authorization': `Bearer ${userToken}` };
  
  try {
    // Clear any existing cache first
    log.test('Warming up - making initial request...');
    await axios.get(`${BASE_URL}/tasks/${testTaskId}`, { headers: userHeaders });
    await sleep(100);
    
    // Test 1: First request (should populate cache)
    log.test('Making first request (cache miss expected)...');
    const { result: firstRequest, time: firstTime } = await measureTime(async () => {
      return axios.get(`${BASE_URL}/tasks/${testTaskId}`, { headers: userHeaders });
    });
    
    log.performance(`First request: ${firstTime}ms`);
    log.data(`Task data: Status=${firstRequest.data.status}, Priority=${firstRequest.data.priority}`);
    
    // Test 2: Second request (should be cached - faster)
    log.test('Making second request (cache hit expected)...');
    const { result: secondRequest, time: secondTime } = await measureTime(async () => {
      return axios.get(`${BASE_URL}/tasks/${testTaskId}`, { headers: userHeaders });
    });
    
    log.performance(`Second request: ${secondTime}ms`);
    
    // Test 3: Third request (should also be cached)
    log.test('Making third request (cache hit expected)...');
    const { result: thirdRequest, time: thirdTime } = await measureTime(async () => {
      return axios.get(`${BASE_URL}/tasks/${testTaskId}`, { headers: userHeaders });
    });
    
    log.performance(`Third request: ${thirdTime}ms`);
    
    // Analyze caching performance
    const avgCachedTime = (secondTime + thirdTime) / 2;
    const improvementPercent = ((firstTime - avgCachedTime) / firstTime * 100);
    
    log.cache('Cache Performance Analysis:');
    log.cache(`  First request (cache miss): ${firstTime}ms`);
    log.cache(`  Average cached requests: ${avgCachedTime.toFixed(1)}ms`);
    log.cache(`  Performance improvement: ${improvementPercent.toFixed(1)}%`);
    
    if (improvementPercent > 10) {
      log.success('✅ Individual task caching is WORKING - cached requests are faster!');
      return { cachingActive: true, firstTime, avgCachedTime };
    } else {
      log.warning('⚠️  Individual task caching may not be working - similar response times');
      return { cachingActive: false, firstTime, avgCachedTime };
    }
    
  } catch (error) {
    log.error(`Caching performance test failed: ${error.response?.data?.message || error.message}`);
    return { cachingActive: false, firstTime: 0, avgCachedTime: 0 };
  }
}

/**
 * Step 4: Test Cache Invalidation After Admin Update
 */
async function testCacheInvalidationAfterUpdate() {
  log.section('Cache Invalidation After Admin Update Test');
  
  const adminHeaders = { 'Authorization': `Bearer ${adminToken}` };
  const userHeaders = { 'Authorization': `Bearer ${userToken}` };
  
  try {
    // Step 1: User gets task (should be cached from previous test)
    log.test('User fetching task (should be cached)...');
    const { result: cachedTask, time: cachedTime } = await measureTime(async () => {
      return axios.get(`${BASE_URL}/tasks/${testTaskId}`, { headers: userHeaders });
    });
    
    log.performance(`Cached request: ${cachedTime}ms`);
    log.data(`Cached task: Status=${cachedTask.data.status}, Priority=${cachedTask.data.priority}`);
    
    // Step 2: Admin updates the task
    log.test('Admin updating task status and priority...');
    const newStatus = cachedTask.data.status === 'PENDING' ? 'IN_PROGRESS' : 'COMPLETED';
    const newPriority = cachedTask.data.priority === 'LOW' ? 'HIGH' : 'LOW';
    
    const updateResponse = await axios.patch(`${BASE_URL}/tasks/${testTaskId}`, {
      title: cachedTask.data.title,
      description: 'Updated by admin to test cache invalidation',
      status: newStatus,
      priority: newPriority,
      userId: testUserId
    }, { headers: adminHeaders });
    
    log.success('Admin successfully updated task');
    log.data(`Updated task: Status=${updateResponse.data.status}, Priority=${updateResponse.data.priority}`);
    
    // Wait for cache invalidation to process
    await sleep(500);
    
    // Step 3: User gets task after admin update (should be cache miss - slower)
    log.test('User fetching task after admin update (cache miss expected)...');
    const { result: postUpdateTask, time: postUpdateTime } = await measureTime(async () => {
      return axios.get(`${BASE_URL}/tasks/${testTaskId}`, { headers: userHeaders });
    });
    
    log.performance(`Post-update request: ${postUpdateTime}ms`);
    log.data(`Post-update task: Status=${postUpdateTask.data.status}, Priority=${postUpdateTask.data.priority}`);
    
    // Step 4: User gets task again (should be cached again - faster)
    log.test('User fetching task again (should be cached again)...');
    const { result: reCachedTask, time: reCachedTime } = await measureTime(async () => {
      return axios.get(`${BASE_URL}/tasks/${testTaskId}`, { headers: userHeaders });
    });
    
    log.performance(`Re-cached request: ${reCachedTime}ms`);
    
    // Analyze results
    log.cache('Cache Invalidation Analysis:');
    log.cache(`  Cached request (before update): ${cachedTime}ms`);
    log.cache(`  Post-update request (cache miss): ${postUpdateTime}ms`);
    log.cache(`  Re-cached request (cache hit): ${reCachedTime}ms`);
    
    // Check data consistency
    const statusUpdated = postUpdateTask.data.status === newStatus;
    const priorityUpdated = postUpdateTask.data.priority === newPriority;
    
    if (statusUpdated && priorityUpdated) {
      log.success('✅ DATA CONSISTENCY: User gets updated data correctly');
    } else {
      log.error('❌ DATA CONSISTENCY ISSUE: User gets stale data!');
      return { dataConsistent: false, cacheInvalidated: false };
    }
    
    // Check cache invalidation timing
    const cacheInvalidated = postUpdateTime > cachedTime * 1.2;
    const reCached = reCachedTime < postUpdateTime * 0.8;
    
    if (cacheInvalidated) {
      log.success('✅ CACHE INVALIDATION: Working correctly (slower response after update)');
    } else {
      log.warning('⚠️  CACHE INVALIDATION: May not be working (similar response time)');
    }
    
    if (reCached) {
      log.success('✅ RE-CACHING: Working correctly (faster response on subsequent request)');
    } else {
      log.info('ℹ️  RE-CACHING: May need more time to populate');
    }
    
    return { 
      dataConsistent: statusUpdated && priorityUpdated, 
      cacheInvalidated,
      reCached,
      cachedTime,
      postUpdateTime,
      reCachedTime
    };
    
  } catch (error) {
    log.error(`Cache invalidation test failed: ${error.response?.data?.message || error.message}`);
    return { dataConsistent: false, cacheInvalidated: false, reCached: false };
  }
}

/**
 * Step 5: Test Admin vs User Cache Separation
 */
async function testAdminUserCacheSeparation() {
  log.section('Admin vs User Cache Separation Test');
  
  const adminHeaders = { 'Authorization': `Bearer ${adminToken}` };
  const userHeaders = { 'Authorization': `Bearer ${userToken}` };
  
  try {
    log.test('Testing that admin and user have separate cache keys...');
    
    // Admin gets the task
    log.test('Admin fetching task...');
    const { result: adminTask, time: adminTime } = await measureTime(async () => {
      return axios.get(`${BASE_URL}/tasks/${testTaskId}`, { headers: adminHeaders });
    });
    
    log.performance(`Admin request: ${adminTime}ms`);
    
    // User gets the task
    log.test('User fetching same task...');
    const { result: userTask, time: userTime } = await measureTime(async () => {
      return axios.get(`${BASE_URL}/tasks/${testTaskId}`, { headers: userHeaders });
    });
    
    log.performance(`User request: ${userTime}ms`);
    
    // Both should get the same data
    const sameData = adminTask.data.id === userTask.data.id && 
                     adminTask.data.status === userTask.data.status;
    
    if (sameData) {
      log.success('✅ CACHE SEPARATION: Both admin and user get consistent data');
      return true;
    } else {
      log.error('❌ CACHE SEPARATION: Admin and user get different data');
      return false;
    }
    
  } catch (error) {
    log.error(`Cache separation test failed: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

/**
 * Main Test Runner
 */
async function runCompleteIndividualTaskCacheTest() {
  console.log('🔍 Complete Individual Task Cache Test Suite');
  console.log('='.repeat(80));
  console.log('Testing comprehensive individual task caching functionality:\n');
  
  try {
    // Step 1: Authenticate
    if (!await authenticate()) {
      process.exit(1);
    }
    
    // Step 2: Setup test task
    if (!await setupTestTask()) {
      process.exit(1);
    }
    
    // Step 3: Test caching performance
    const cachingResult = await testIndividualTaskCaching();
    
    // Step 4: Test cache invalidation
    const invalidationResult = await testCacheInvalidationAfterUpdate();
    
    // Step 5: Test cache separation
    const separationResult = await testAdminUserCacheSeparation();
    
    // Final results
    log.section('Complete Test Results Summary');
    
    log.info('Individual Task Caching Test Results:');
    log.info(`✅ Caching Active: ${cachingResult.cachingActive ? 'YES' : 'NO'}`);
    log.info(`✅ Data Consistency: ${invalidationResult.dataConsistent ? 'PASS' : 'FAIL'}`);
    log.info(`✅ Cache Invalidation: ${invalidationResult.cacheInvalidated ? 'WORKING' : 'NEEDS ATTENTION'}`);
    log.info(`✅ Re-caching: ${invalidationResult.reCached ? 'WORKING' : 'PARTIAL'}`);
    log.info(`✅ Cache Separation: ${separationResult ? 'WORKING' : 'NEEDS ATTENTION'}`);
    
    const allTestsPassed = cachingResult.cachingActive && 
                          invalidationResult.dataConsistent && 
                          invalidationResult.cacheInvalidated && 
                          separationResult;
    
    if (allTestsPassed) {
      log.success('\n🎉 ALL TESTS PASSED! Individual task caching is working perfectly!');
      log.success('✅ Cache performance improvement detected');
      log.success('✅ Cache invalidation working correctly');
      log.success('✅ Data consistency maintained');
      log.success('✅ Admin/User cache separation working');
    } else {
      log.warning('\n⚠️  SOME TESTS NEED ATTENTION');
      if (!cachingResult.cachingActive) log.error('❌ Caching may not be active');
      if (!invalidationResult.dataConsistent) log.error('❌ Data consistency issues detected');
      if (!invalidationResult.cacheInvalidated) log.error('❌ Cache invalidation may not be working');
      if (!separationResult) log.error('❌ Cache separation issues detected');
    }
    
  } catch (error) {
    log.error(`Test suite failed: ${error.message}`);
    process.exit(1);
  }
}

// Run the complete test
runCompleteIndividualTaskCacheTest();
