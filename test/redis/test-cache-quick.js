// Quick cache test using seeded admin user
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function quickCacheTest() {
  console.log('🚀 Quick Cache Test with Seeded Admin User...\n');

  try {
    // Try to login with seeded admin user
    console.log('🔐 Logging in with seeded admin user...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'admin@example.com',
      password: 'admin123'
    });

    const token = loginResponse.data.accessToken;
    console.log('✅ Login successful!');
    console.log(`🎫 JWT Token: ${token}\n`);

    const headers = { 'Authorization': `Bearer ${token}` };

    // Test 1: Cache Stats (First request - cache miss)
    console.log('📊 Test 1: Cache Stats (First request - cache miss)');
    const start1 = Date.now();
    const response1 = await axios.get(`${BASE_URL}/tasks/cache-stats`, { headers });
    const time1 = Date.now() - start1;
    console.log(`⏱️  Response time: ${time1}ms`);
    console.log(`📈 Cache status: ${response1.data.cache.connected ? 'Connected' : 'Disconnected'}`);
    console.log(`🔢 Cache keys: ${response1.data.cache.keys}`);
    console.log(`💾 Memory usage: ${response1.data.cache.memory}\n`);

    // Test 2: Cache Stats (Second request - cache hit)
    console.log('📊 Test 2: Cache Stats (Second request - cache hit)');
    const start2 = Date.now();
    const response2 = await axios.get(`${BASE_URL}/tasks/cache-stats`, { headers });
    const time2 = Date.now() - start2;
    console.log(`⏱️  Response time: ${time2}ms`);
    console.log(`📈 Cache status: ${response2.data.cache.connected ? 'Connected' : 'Disconnected'}`);
    console.log(`🔢 Cache keys: ${response2.data.cache.keys}`);
    console.log(`💾 Memory usage: ${response2.data.cache.memory}\n`);

    // Test 3: Task Statistics (Cached endpoint)
    console.log('📊 Test 3: Task Statistics (First request)');
    const start3 = Date.now();
    const response3 = await axios.get(`${BASE_URL}/tasks/stats`, { headers });
    const time3 = Date.now() - start3;
    console.log(`⏱️  Response time: ${time3}ms`);
    console.log(`📊 Stats: ${JSON.stringify(response3.data)}\n`);

    // Test 4: Task Statistics (Second request - should be cached)
    console.log('📊 Test 4: Task Statistics (Second request - cache hit)');
    const start4 = Date.now();
    const response4 = await axios.get(`${BASE_URL}/tasks/stats`, { headers });
    const time4 = Date.now() - start4;
    console.log(`⏱️  Response time: ${time4}ms`);
    console.log(`📊 Stats: ${JSON.stringify(response4.data)}\n`);

    // Test 5: Task List (Cached endpoint)
    console.log('📊 Test 5: Task List (First request)');
    const start5 = Date.now();
    const response5 = await axios.get(`${BASE_URL}/tasks`, { headers });
    const time5 = Date.now() - start5;
    console.log(`⏱️  Response time: ${time5}ms`);
    console.log(`📋 Tasks found: ${response5.data.data?.length || 0}\n`);

    // Test 6: Task List (Second request - should be cached)
    console.log('📊 Test 6: Task List (Second request - cache hit)');
    const start6 = Date.now();
    const response6 = await axios.get(`${BASE_URL}/tasks`, { headers });
    const time6 = Date.now() - start6;
    console.log(`⏱️  Response time: ${time6}ms`);
    console.log(`📋 Tasks found: ${response6.data.data?.length || 0}\n`);

    // Performance Analysis
    console.log('🎯 Performance Analysis:');
    console.log('─'.repeat(50));
    console.log(`Cache Stats:     ${time1}ms → ${time2}ms (${((time1 - time2) / time1 * 100).toFixed(1)}% improvement)`);
    console.log(`Task Statistics: ${time3}ms → ${time4}ms (${((time3 - time4) / time3 * 100).toFixed(1)}% improvement)`);
    console.log(`Task List:       ${time5}ms → ${time6}ms (${((time5 - time6) / time5 * 100).toFixed(1)}% improvement)`);
    console.log('─'.repeat(50));

    const avgImprovement = [
      ((time1 - time2) / time1 * 100),
      ((time3 - time4) / time3 * 100),
      ((time5 - time6) / time5 * 100)
    ].reduce((a, b) => a + b, 0) / 3;

    console.log(`📈 Average performance improvement: ${avgImprovement.toFixed(1)}%`);

    if (avgImprovement > 0) {
      console.log('✅ Cache is working! Requests are getting faster on repeated calls.');
    } else {
      console.log('⚠️  Cache might not be working as expected.');
    }

    console.log('\n🎉 Cache test completed successfully!');

  } catch (error) {
    if (error.response?.status === 401) {
      console.error('❌ Authentication failed. Trying alternative approach...\n');

      // Try with the other seeded user
      try {
        console.log('🔐 Trying with regular user...');
        const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
          email: 'user@example.com',
          password: 'user123'
        });

        const token = loginResponse.data.accessToken;
        console.log('✅ Login successful with regular user!');
        console.log(`🎫 JWT Token: ${token.substring(0, 20)}...\n`);

        const headers = { 'Authorization': `Bearer ${token}` };

        // Quick test with regular user
        console.log('📊 Quick test with regular user...');
        const start = Date.now();
        const response = await axios.get(`${BASE_URL}/tasks/stats`, { headers });
        const time = Date.now() - start;
        console.log(`⏱️  Response time: ${time}ms`);
        console.log(`📊 Stats: ${JSON.stringify(response.data)}`);
        console.log('\n✅ Cache is accessible with regular user!');

      } catch (secondError) {
        console.error('❌ Both admin and user login failed.');
        console.log('\n💡 Solutions:');
        console.log('   1. Run database seeding: bun run seed');
        console.log('   2. Or register manually: node test-cache-simple.js');
        console.log('   3. Check if database is properly set up');
      }
    } else {
      console.error('❌ Error:', error.response?.data || error.message);
      console.log('\n💡 Make sure:');
      console.log('   1. Application is running: bun run start:dev');
      console.log('   2. Redis is running: redis-cli ping');
      console.log('   3. Database is seeded: bun run seed');
    }
  }
}

quickCacheTest();
