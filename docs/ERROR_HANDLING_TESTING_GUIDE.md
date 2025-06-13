# 🧪 **ERROR HANDLING TESTING GUIDE**

## 📋 **OVERVIEW**

This guide provides step-by-step instructions to test all error handling scenarios in your TaskFlow API application.

## 🚀 **PREREQUISITES**

1. **Application Running**: Ensure your app is running on `http://localhost:3000`
2. **Database Setup**: Database should be properly migrated and seeded
3. **Redis Running**: Redis should be running for rate limiting tests
4. **Dependencies**: Make sure `axios` is installed for testing scripts

```bash
# Start the application
bun run start:dev

# Ensure database is seeded
bun run seed

# Verify Redis is running
redis-cli ping
```

---

## 🛠️ **AUTOMATED TESTING**

### **Method 1: Comprehensive Test Suite**

Run the complete automated error handling test suite:

```bash
npm run test:errors
```

**What it tests:**
- ✅ Global exception filter behavior
- ✅ Error sanitization (no sensitive data exposure)
- ✅ Database error handling
- ✅ Validation error handling
- ✅ Authentication/Authorization errors
- ✅ Rate limiting errors
- ✅ Transaction rollback behavior
- ✅ Security headers

**Expected Output:**
```
🧪 Comprehensive Error Handling Test Suite
============================================================

📋 Authentication Setup
────────────────────────────────────────
✅ Test user registered successfully
✅ Authentication setup completed

📋 Global Exception Filter Tests
────────────────────────────────────────
🔬 Testing HTTP Exception Handling...
✅ HTTP exception properly handled
🔬 Testing Database Error Handling...
🛡️  Database error properly sanitized

📋 Error Sanitization Tests
────────────────────────────────────────
🔬 Testing SQL Injection Error Sanitization...
🛡️  SQL injection error properly sanitized
🔬 Testing Path Disclosure Prevention...
🛡️  File path information properly sanitized

📋 Error Handling Test Results
============================================================
ℹ️  Total Tests: 15
✅ Passed: 14
❌ Failed: 1
🎉 EXCELLENT: 93.3% error handling coverage
🛡️  Error handling system is robust and production-ready!
```

### **Method 2: Quick Manual Tests**

Run quick manual tests for immediate verification:

```bash
npm run test:errors:manual
```

**What it tests:**
- ✅ Authentication errors (missing/invalid tokens)
- ✅ Validation errors (missing fields, wrong types)
- ✅ SQL injection protection
- ✅ Rate limiting behavior
- ✅ Database error sanitization
- ✅ Security headers

---

## 🔍 **MANUAL TESTING SCENARIOS**

### **1. Authentication Error Testing**

#### **Test 1.1: Missing Authorization Header**
```bash
curl -X GET http://localhost:3000/tasks
```

**Expected Response:**
```json
{
  "statusCode": 401,
  "message": "Authentication required",
  "error": "Unauthorized",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "path": "/tasks"
}
```

#### **Test 1.2: Invalid JWT Token**
```bash
curl -X GET http://localhost:3000/tasks \
  -H "Authorization: Bearer invalid-token-here"
```

**Expected Response:**
```json
{
  "statusCode": 401,
  "message": "Authentication required",
  "error": "Unauthorized",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "path": "/tasks"
}
```

**✅ Verification Points:**
- Status code is 401
- No JWT-specific error details exposed
- No token information in response
- Generic error message used

### **2. Validation Error Testing**

#### **Test 2.1: Missing Required Fields**

First, get a valid token:
```bash
TOKEN=$(curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}' \
  | jq -r '.accessToken')
```

Then test missing fields:
```bash
curl -X POST http://localhost:3000/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected Response:**
```json
{
  "statusCode": 400,
  "message": "Invalid input provided",
  "error": "Bad Request",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "path": "/tasks"
}
```

#### **Test 2.2: Invalid Data Types**
```bash
curl -X POST http://localhost:3000/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":123,"description":true,"userId":"not-a-uuid"}'
```

**✅ Verification Points:**
- Status code is 400
- Generic validation error message
- No field enumeration
- No internal validation details exposed

### **3. SQL Injection Protection Testing**

#### **Test 3.1: SQL Injection in Query Parameters**
```bash
curl -X GET "http://localhost:3000/tasks?status='; DROP TABLE tasks; --" \
  -H "Authorization: Bearer $TOKEN"
```

**✅ Verification Points:**
- Request handled safely (no 500 error)
- No SQL-related terms in error response
- No database schema information exposed
- Application continues to function

### **4. Rate Limiting Testing**

#### **Test 4.1: Rapid Requests**
```bash
# Make 15 rapid requests to trigger rate limiting
for i in {1..15}; do
  curl -X GET http://localhost:3000/tasks/stats \
    -H "Authorization: Bearer $TOKEN" \
    -w "Status: %{http_code}\n" \
    -s -o /dev/null &
done
wait
```

**Expected Behavior:**
- First 10 requests: Status 200
- Remaining requests: Status 429

**Expected Rate Limit Response:**
```json
{
  "statusCode": 429,
  "message": "Too many requests",
  "error": "Rate limit exceeded",
  "retryAfter": 60
}
```

**✅ Verification Points:**
- Status code is 429 after limit exceeded
- No IP address exposed in response
- Retry-after header present
- Generic error message

### **5. Database Error Testing**

#### **Test 5.1: Invalid UUID Format**
```bash
curl -X GET http://localhost:3000/tasks/invalid-uuid-format \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
{
  "statusCode": 500,
  "message": "Internal server error",
  "error": "Internal Server Error",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "path": "/tasks/:id"
}
```

**✅ Verification Points:**
- No database-specific error details
- No SQL query information
- No TypeORM stack traces
- Generic internal server error message

#### **Test 5.2: Non-existent Resource**
```bash
curl -X GET http://localhost:3000/tasks/550e8400-e29b-41d4-a716-446655440999 \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
{
  "statusCode": 404,
  "message": "Task not found",
  "error": "Not Found",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "path": "/tasks/:id"
}
```

### **6. Security Headers Testing**

#### **Test 6.1: Check Security Headers**
```bash
curl -I http://localhost:3000/auth/login
```

**Expected Headers:**
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
```

**✅ Verification Points:**
- All security headers present
- Proper values set
- Headers applied to all responses

---

## 📊 **TESTING CHECKLIST**

### **Error Sanitization Checklist:**
- [ ] No database schema information exposed
- [ ] No SQL queries in error responses
- [ ] No file paths or stack traces exposed
- [ ] No JWT token details in error messages
- [ ] No IP addresses in rate limit responses
- [ ] No internal service names exposed
- [ ] Generic error messages for security errors

### **Error Handling Checklist:**
- [ ] HTTP exceptions properly caught and formatted
- [ ] Database errors sanitized and logged server-side
- [ ] Validation errors return 400 with safe messages
- [ ] Authentication errors return 401 with generic messages
- [ ] Authorization errors return 403 with safe messages
- [ ] Rate limiting returns 429 with retry information
- [ ] Unknown errors return 500 with generic messages

### **Security Checklist:**
- [ ] Security headers present on all responses
- [ ] No sensitive information in error responses
- [ ] Proper error logging for debugging
- [ ] Transaction rollback on database errors
- [ ] Input validation prevents injection attacks

---

## 🚨 **TROUBLESHOOTING**

### **Common Issues:**

1. **Tests Fail with Connection Error**
   - Ensure application is running on port 3000
   - Check if database is accessible
   - Verify Redis is running

2. **Authentication Tests Fail**
   - Run `bun run seed` to create test users
   - Check if JWT secret is properly configured
   - Verify user credentials in seed data

3. **Rate Limiting Not Working**
   - Check Redis connection
   - Verify ThrottlerModule configuration
   - Ensure rate limiting guard is applied

4. **Database Errors Not Sanitized**
   - Check if GlobalExceptionFilter is registered
   - Verify ErrorSanitizationService is working
   - Check filter order in app.module.ts

---

## 🎯 **SUCCESS CRITERIA**

Your error handling is working correctly if:

✅ **90%+ test coverage** in automated tests
✅ **No sensitive information** exposed in any error response
✅ **Consistent error format** across all endpoints
✅ **Proper HTTP status codes** for different error types
✅ **Security headers** present on all responses
✅ **Rate limiting** properly enforced
✅ **Database errors** sanitized and logged server-side only
✅ **Transaction safety** maintained during errors

---

## 📝 **REPORTING ISSUES**

If any tests fail or security issues are found:

1. **Document the exact request** that caused the issue
2. **Capture the full response** including headers
3. **Note any sensitive information** exposed
4. **Check server logs** for proper error logging
5. **Verify the fix** by re-running the tests

Your error handling implementation is **production-ready** when all tests pass and no sensitive information is exposed in any error scenario.
