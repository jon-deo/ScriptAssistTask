/**
 * 🔍 Individual Task Cache Issue Test
 * 
 * This test specifically checks the scenario you described:
 * 1. Admin updates a user's task (status/priority)
 * 2. User gets that task by ID
 * 3. Check if user gets old cached data vs new data
 * 
 * This will help identify if individual task caching has cache invalidation issues.
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
  section: (title) => console.log(`\n🔷 ${title}\n${'='.repeat(60)}`),
  test: (msg) => console.log(`🧪 ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`),
  info: (msg) => console.log(`ℹ️  ${msg}`),
  performance: (msg) => console.log(`⚡ ${msg}`),
  warning: (msg) => console.log(`⚠️  ${msg}`),
  data: (msg) => console.log(`📊 ${msg}`)
};

/**
 * Step 1: Authentication for both Admin and User
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
    try {
      const userResponse = await axios.post(`${BASE_URL}/auth/login`, {
        email: 'himansu@gmail.com',
        password: 'Himansu@21'
      });

      userToken = userResponse.data.accessToken;
      log.success('User authentication successful');
    } catch (userError) {
      log.error(`Regular user login failed: ${userError.response?.data?.message || userError.message}`);
      log.info('This might indicate the database needs seeding. Run: bun run seed');
      throw userError;
    }
    
    return true;
  } catch (error) {
    log.error(`Authentication failed: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

/**
 * Step 2: Setup Test Task (Use existing seeded task)
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
      // If no existing tasks, create one as admin for the user
      log.test('No existing tasks found, creating test task assigned to regular user...');
      const adminHeaders = { 'Authorization': `Bearer ${adminToken}` };

      const taskResponse = await axios.post(`${BASE_URL}/tasks`, {
        title: 'Individual Cache Test Task',
        description: 'This task will be updated by admin and fetched by user',
        status: 'PENDING',
        priority: 'LOW',
        userId: '550e8400-e29b-41d4-a716-446655440001' // Regular user ID from seeded data
      }, { headers: adminHeaders });

      testTaskId = taskResponse.data.id;
      testUserId = taskResponse.data.userId;

      log.success(`Test task created with ID: ${testTaskId}`);
      log.info(`Task assigned to user: ${testUserId}`);
      log.data(`Initial task data: Status=${taskResponse.data.status}, Priority=${taskResponse.data.priority}`);

      return true;
    }
  } catch (error) {
    log.error(`Failed to setup test task: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

/**
 * Step 3: Test Individual Task Cache Issue
 */
async function testIndividualTaskCacheIssue() {
  log.section('Individual Task Cache Issue Test');
  
  const adminHeaders = { 'Authorization': `Bearer ${adminToken}` };
  const userHeaders = { 'Authorization': `Bearer ${userToken}` };
  
  try {
    // Step 1: User gets the task (first time - cache miss or no cache)
    log.test('User fetching task for the first time...');
    const { result: initialTask, time: initialTime } = await measureTime(async () => {
      return axios.get(`${BASE_URL}/tasks/${testTaskId}`, { headers: userHeaders });
    });
    
    log.performance(`Initial task fetch: ${initialTime}ms`);
    log.data(`Initial task: Status=${initialTask.data.status}, Priority=${initialTask.data.priority}`);
    
    // Step 2: User gets the task again (should be cached if caching is enabled)
    log.test('User fetching task again (checking for cache)...');
    const { result: cachedTask, time: cachedTime } = await measureTime(async () => {
      return axios.get(`${BASE_URL}/tasks/${testTaskId}`, { headers: userHeaders });
    });
    
    log.performance(`Cached task fetch: ${cachedTime}ms`);
    
    // Analyze if caching is active for individual tasks
    if (cachedTime < initialTime * 0.7) {
      log.success('Individual task caching appears to be ACTIVE (faster second request)');
    } else {
      log.info('Individual task caching appears to be DISABLED (similar response times)');
    }
    
    // Step 3: Admin updates the task (status and priority)
    log.test('Admin updating task status and priority...');
    const updateResponse = await axios.patch(`${BASE_URL}/tasks/${testTaskId}`, {
      title: 'Individual Cache Test Task',
      description: 'Task updated by admin to test cache invalidation',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      userId: testUserId
    }, { headers: adminHeaders });
    
    log.success('Admin successfully updated task');
    log.data(`Updated task: Status=${updateResponse.data.status}, Priority=${updateResponse.data.priority}`);
    
    // Wait a moment for cache invalidation to process
    await sleep(500);
    
    // Step 4: User gets the task after admin update
    log.test('User fetching task after admin update...');
    const { result: postUpdateTask, time: postUpdateTime } = await measureTime(async () => {
      return axios.get(`${BASE_URL}/tasks/${testTaskId}`, { headers: userHeaders });
    });
    
    log.performance(`Post-update task fetch: ${postUpdateTime}ms`);
    log.data(`Post-update task: Status=${postUpdateTask.data.status}, Priority=${postUpdateTask.data.priority}`);
    
    // Step 5: Analyze the results
    log.section('Cache Invalidation Analysis');
    
    // Check if data was updated correctly
    const statusUpdated = postUpdateTask.data.status === 'IN_PROGRESS';
    const priorityUpdated = postUpdateTask.data.priority === 'HIGH';
    
    if (statusUpdated && priorityUpdated) {
      log.success('✅ DATA CONSISTENCY: User gets updated data correctly');
    } else {
      log.error('❌ DATA CONSISTENCY ISSUE: User gets stale data!');
      log.error(`  Expected: Status=IN_PROGRESS, Priority=HIGH`);
      log.error(`  Actual:   Status=${postUpdateTask.data.status}, Priority=${postUpdateTask.data.priority}`);
    }
    
    // Check response time patterns
    if (cachedTime < initialTime * 0.7) {
      // Caching was active
      if (postUpdateTime > cachedTime * 1.2) {
        log.success('✅ CACHE INVALIDATION: Working correctly (slower response after update)');
      } else {
        log.warning('⚠️  CACHE INVALIDATION: May not be working (similar response time)');
      }
    } else {
      log.info('ℹ️  CACHE STATUS: Individual task caching appears to be disabled');
    }
    
    // Performance summary
    log.section('Performance Summary');
    log.performance(`Initial fetch:    ${initialTime}ms`);
    log.performance(`Cached fetch:     ${cachedTime}ms`);
    log.performance(`Post-update fetch: ${postUpdateTime}ms`);
    
    // Final verdict
    log.section('Final Verdict');
    
    if (statusUpdated && priorityUpdated) {
      if (cachedTime < initialTime * 0.7) {
        if (postUpdateTime > cachedTime * 1.2) {
          log.success('🎉 PERFECT: Individual task caching is active AND cache invalidation works!');
        } else {
          log.warning('⚠️  PARTIAL: Individual task caching is active but cache invalidation may be slow');
        }
      } else {
        log.info('ℹ️  OK: No individual task caching detected, so no cache invalidation issues');
      }
    } else {
      log.error('🚨 CRITICAL ISSUE: User gets stale data after admin updates!');
      log.error('This indicates a cache invalidation problem that needs immediate attention.');
    }
    
    return { statusUpdated, priorityUpdated, cachingActive: cachedTime < initialTime * 0.7 };
    
  } catch (error) {
    log.error(`Individual task cache test failed: ${error.response?.data?.message || error.message}`);
    return { statusUpdated: false, priorityUpdated: false, cachingActive: false };
  }
}

/**
 * Step 4: Test with Cache Disabled (if possible)
 */
async function testWithoutCache() {
  log.section('Testing Without Cache (Reference)');
  
  const userHeaders = { 'Authorization': `Bearer ${userToken}` };
  
  try {
    // Multiple requests to see consistent timing without cache
    log.test('Making multiple requests without cache...');
    
    const times = [];
    for (let i = 0; i < 3; i++) {
      const { time } = await measureTime(async () => {
        return axios.get(`${BASE_URL}/tasks/${testTaskId}`, { headers: userHeaders });
      });
      times.push(time);
      await sleep(100);
    }
    
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    log.performance(`Average response time without cache: ${avgTime.toFixed(1)}ms`);
    log.info(`Individual times: ${times.join('ms, ')}ms`);
    
    return avgTime;
  } catch (error) {
    log.error(`Reference test failed: ${error.message}`);
    return null;
  }
}

/**
 * Step 5: Cleanup
 */
async function cleanup() {
  log.section('Cleanup');
  
  const adminHeaders = { 'Authorization': `Bearer ${adminToken}` };
  
  try {
    if (testTaskId) {
      log.test('Deleting test task...');
      await axios.delete(`${BASE_URL}/tasks/${testTaskId}`, { headers: adminHeaders });
      log.success('Test task deleted');
    }
  } catch (error) {
    log.warning(`Cleanup failed: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Main Test Runner
 */
async function runIndividualTaskCacheTest() {
  console.log('🔍 Individual Task Cache Issue Test');
  console.log('='.repeat(80));
  console.log('Testing the specific scenario:');
  console.log('1. Admin updates user task (status/priority)');
  console.log('2. User gets task by ID');
  console.log('3. Check if user gets old cached data vs new data\n');
  
  try {
    // Step 1: Authenticate both users
    if (!await authenticate()) {
      process.exit(1);
    }
    
    // Step 2: Setup test task
    if (!await setupTestTask()) {
      process.exit(1);
    }
    
    // Step 3: Test the cache issue
    const result = await testIndividualTaskCacheIssue();
    
    // Step 4: Reference test without cache
    await testWithoutCache();
    
    // Step 5: Cleanup
    await cleanup();
    
    // Final summary
    log.section('Test Conclusion');
    
    if (result.statusUpdated && result.priorityUpdated) {
      log.success('✅ No cache invalidation issues detected for individual task retrieval');
    } else {
      log.error('❌ Cache invalidation issue confirmed - user gets stale data!');
      log.error('RECOMMENDATION: Fix individual task cache invalidation');
    }
    
  } catch (error) {
    log.error(`Test suite failed: ${error.message}`);
    await cleanup();
    process.exit(1);
  }
}

// Run the test
runIndividualTaskCacheTest();
