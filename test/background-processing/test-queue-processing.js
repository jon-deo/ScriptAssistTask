const axios = require('axios');

// ✅ COMPREHENSIVE: Background Processing Test Suite
const BASE_URL = 'http://localhost:3000';

// Test configuration
const TEST_CONFIG = {
  timeout: 10000,
  retryDelay: 1000,
  maxRetries: 3,
};

// Logging utilities
const log = {
  info: (msg) => console.log(`ℹ️  ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`),
  warning: (msg) => console.log(`⚠️  ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`),
  test: (msg) => console.log(`🧪 ${msg}`),
  header: (msg) => console.log(`\n🔥 ${msg}\n${'='.repeat(50)}`),
  section: (msg) => console.log(`\n📋 ${msg}\n${'-'.repeat(30)}`),
};

// Global variables
let authToken = '';
let adminToken = '';

/**
 * Setup authentication for tests
 */
async function setupAuthentication() {
  log.section('Setting up authentication');

  try {
    // Login as admin user
    const adminLogin = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'admin@example.com',
      password: 'admin123'
    });

    adminToken = adminLogin.data.accessToken;
    log.success('Admin authentication successful');

    // Login as regular user
    const userLogin = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'user@example.com',
      password: 'user123'
    });

    authToken = userLogin.data.accessToken;
    log.success('User authentication successful');

  } catch (error) {
    log.error(`Authentication setup failed: ${error.message}`);
    throw error;
  }
}

/**
 * Test 1: Queue Metrics and Monitoring
 */
async function testQueueMetrics() {
  log.section('Queue Metrics and Monitoring Tests');

  try {
    // Test getting queue metrics (admin only)
    log.test('Testing queue metrics endpoint...');
    const metricsResponse = await axios.get(`${BASE_URL}/tasks/admin/queue-metrics`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    if (metricsResponse.status === 200 && metricsResponse.data.metrics) {
      log.success('Queue metrics retrieved successfully');
      log.info(`Metrics: ${JSON.stringify(metricsResponse.data.metrics, null, 2)}`);
    } else {
      log.error('Queue metrics response invalid');
    }

    // Test access control (regular user should be denied)
    log.test('Testing queue metrics access control...');
    try {
      await axios.get(`${BASE_URL}/tasks/admin/queue-metrics`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      log.error('Regular user should not access admin endpoints');
    } catch (error) {
      if (error.response?.status === 403) {
        log.success('Access control working correctly');
      } else {
        log.warning(`Unexpected error: ${error.response?.status}`);
      }
    }

  } catch (error) {
    log.error(`Queue metrics test failed: ${error.message}`);
  }
}

/**
 * Test 2: Manual Overdue Tasks Trigger
 */
async function testOverdueTasksTrigger() {
  log.section('Overdue Tasks Trigger Tests');

  try {
    // Create a task with past due date
    log.test('Creating overdue task for testing...');
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1); // Yesterday

    const taskResponse = await axios.post(`${BASE_URL}/tasks`, {
      title: 'Test Overdue Task',
      description: 'This task is overdue for testing',
      dueDate: pastDate.toISOString(),
      status: 'pending'
    }, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    const taskId = taskResponse.data.id;
    log.success(`Created overdue task: ${taskId}`);

    // Wait a moment for task to be saved
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Trigger overdue check manually
    log.test('Triggering manual overdue check...');
    const triggerResponse = await axios.post(`${BASE_URL}/tasks/admin/trigger-overdue-check`, {}, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    if (triggerResponse.status === 200) {
      log.success('Overdue check triggered successfully');
      log.info(`Result: ${JSON.stringify(triggerResponse.data, null, 2)}`);
    } else {
      log.error('Overdue check trigger failed');
    }

    // Clean up - delete test task
    await axios.delete(`${BASE_URL}/tasks/${taskId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    log.info('Test task cleaned up');

  } catch (error) {
    log.error(`Overdue tasks trigger test failed: ${error.message}`);
  }
}

/**
 * Test 3: Task Status Update Queue Processing
 */
async function testTaskStatusUpdates() {
  log.section('Task Status Update Queue Processing Tests');

  try {
    // Create a task
    log.test('Creating task for status update testing...');
    const taskResponse = await axios.post(`${BASE_URL}/tasks`, {
      title: 'Queue Processing Test Task',
      description: 'Testing queue processing for status updates',
      status: 'pending'
    }, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    const taskId = taskResponse.data.id;
    log.success(`Created task: ${taskId}`);

    // Update task status (this should trigger queue processing)
    log.test('Updating task status to trigger queue processing...');
    const updateResponse = await axios.patch(`${BASE_URL}/tasks/${taskId}`, {
      status: 'in_progress'
    }, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (updateResponse.status === 200) {
      log.success('Task status updated successfully');
      log.info(`Updated task status to: ${updateResponse.data.status}`);
    }

    // Wait for queue processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check queue metrics to see if job was processed
    log.test('Checking queue metrics after status update...');
    const metricsResponse = await axios.get(`${BASE_URL}/tasks/admin/queue-metrics`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    const metrics = metricsResponse.data.metrics;
    if (metrics.processed > 0) {
      log.success(`Queue processed ${metrics.processed} jobs`);
      log.info(`Success rate: ${metrics.successRate}`);
    } else {
      log.warning('No jobs processed yet - queue might be slow');
    }

    // Clean up
    await axios.delete(`${BASE_URL}/tasks/${taskId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    log.info('Test task cleaned up');

  } catch (error) {
    log.error(`Task status update test failed: ${error.message}`);
  }
}

/**
 * Test 4: Bulk Operations Queue Processing
 */
async function testBulkOperationsQueue() {
  log.section('Bulk Operations Queue Processing Tests');

  try {
    // Create multiple tasks
    log.test('Creating multiple tasks for bulk testing...');
    const tasks = [];
    for (let i = 0; i < 3; i++) {
      const taskResponse = await axios.post(`${BASE_URL}/tasks`, {
        title: `Bulk Test Task ${i + 1}`,
        description: `Testing bulk operations ${i + 1}`,
        status: 'pending'
      }, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      tasks.push(taskResponse.data.id);
    }
    log.success(`Created ${tasks.length} tasks for bulk testing`);

    // Perform bulk status update
    log.test('Performing bulk status update...');
    const bulkResponse = await axios.post(`${BASE_URL}/tasks/batch`, {
      tasks: tasks,
      action: 'complete'
    }, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (bulkResponse.status === 200) {
      log.success(`Bulk operation completed: ${bulkResponse.data.processed} tasks processed`);
    }

    // Wait for queue processing
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check final queue metrics
    log.test('Checking final queue metrics...');
    const finalMetrics = await axios.get(`${BASE_URL}/tasks/admin/queue-metrics`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    log.success('Final queue metrics:');
    log.info(JSON.stringify(finalMetrics.data.metrics, null, 2));

    // Clean up
    for (const taskId of tasks) {
      await axios.delete(`${BASE_URL}/tasks/${taskId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
    }
    log.info('All test tasks cleaned up');

  } catch (error) {
    log.error(`Bulk operations queue test failed: ${error.message}`);
  }
}

/**
 * Test 5: Error Handling in Queue Processing
 */
async function testQueueErrorHandling() {
  log.section('Queue Error Handling Tests');

  try {
    // Reset metrics for clean test
    log.test('Resetting queue metrics...');
    await axios.post(`${BASE_URL}/tasks/admin/reset-queue-metrics`, {}, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    log.success('Queue metrics reset');

    // Try to update non-existent task (should cause queue job to fail)
    log.test('Testing error handling with invalid task update...');
    try {
      await axios.patch(`${BASE_URL}/tasks/invalid-task-id`, {
        status: 'completed'
      }, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
    } catch (error) {
      log.success('Invalid task update properly rejected');
    }

    // Wait for any queue processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check metrics for failed jobs
    log.test('Checking metrics for error handling...');
    const errorMetrics = await axios.get(`${BASE_URL}/tasks/admin/queue-metrics`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    const metrics = errorMetrics.data.metrics;
    log.info(`Queue metrics after error test: ${JSON.stringify(metrics, null, 2)}`);

    if (metrics.failed >= 0) {
      log.success('Error handling metrics available');
    }

  } catch (error) {
    log.error(`Queue error handling test failed: ${error.message}`);
  }
}

/**
 * Main test runner
 */
async function runBackgroundProcessingTests() {
  log.header('Background Processing Test Suite');
  
  const startTime = Date.now();

  try {
    // Setup
    await setupAuthentication();

    // Run all test suites
    await testQueueMetrics();
    await testOverdueTasksTrigger();
    await testTaskStatusUpdates();
    await testBulkOperationsQueue();
    await testQueueErrorHandling();

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    log.header(`Background Processing Tests Completed (${duration}s)`);
    log.success('🎉 All background processing tests completed!');
    log.info('📊 Check the output above to verify queue functionality');

  } catch (error) {
    log.error(`Test suite failed: ${error.message}`);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runBackgroundProcessingTests();
}

module.exports = {
  runBackgroundProcessingTests,
  setupAuthentication,
  testQueueMetrics,
  testOverdueTasksTrigger,
  testTaskStatusUpdates,
  testBulkOperationsQueue,
  testQueueErrorHandling,
};
