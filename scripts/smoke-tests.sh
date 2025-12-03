#!/bin/bash

# Smoke tests for deployment verification
# Usage: ./scripts/smoke-tests.sh [staging|production]

set -e

ENVIRONMENT=${1:-staging}
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
LOG_FILE="./logs/smoke-test-${ENVIRONMENT}-${TIMESTAMP}.log"

# Create logs directory
mkdir -p ./logs

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Set API URL based on environment
if [ "$ENVIRONMENT" = "production" ]; then
    API_URL="https://api.yourdomain.com"
elif [ "$ENVIRONMENT" = "staging" ]; then
    API_URL="https://api-staging.yourdomain.com"
else
    echo -e "${RED}❌ Invalid environment: $ENVIRONMENT${NC}"
    echo "Usage: ./scripts/smoke-tests.sh [staging|production]"
    exit 1
fi

echo "========================================" | tee -a "$LOG_FILE"
echo "Smoke Tests - $ENVIRONMENT Environment" | tee -a "$LOG_FILE"
echo "API URL: $API_URL" | tee -a "$LOG_FILE"
echo "Timestamp: $TIMESTAMP" | tee -a "$LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Function to run a test
run_test() {
    local test_name=$1
    local test_command=$2
    local expected_status=${3:-200}
    
    echo -n "Testing: $test_name... " | tee -a "$LOG_FILE"
    
    # Run the test and capture response
    response=$(eval "$test_command" 2>&1)
    status=$?
    
    if [ $status -eq 0 ]; then
        echo -e "${GREEN}✅ PASSED${NC}" | tee -a "$LOG_FILE"
        echo "  Response: $response" >> "$LOG_FILE"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}❌ FAILED${NC}" | tee -a "$LOG_FILE"
        echo "  Error: $response" >> "$LOG_FILE"
        ((TESTS_FAILED++))
    fi
    
    echo "" >> "$LOG_FILE"
}

# Test 1: Health Check
run_test "Health Check" \
    "curl -f -s -o /dev/null -w '%{http_code}' $API_URL/health | grep -q '200'"

# Test 2: API Documentation
run_test "API Documentation" \
    "curl -f -s -o /dev/null -w '%{http_code}' $API_URL/docs | grep -q '200'"

# Test 3: OpenAPI Spec
run_test "OpenAPI Specification" \
    "curl -f -s -o /dev/null -w '%{http_code}' $API_URL/openapi.json | grep -q '200'"

# Test 4: CORS Headers
run_test "CORS Headers" \
    "curl -s -I -X OPTIONS $API_URL/health -H 'Origin: https://yourdomain.com' | grep -q 'Access-Control-Allow-Origin'"

# Test 5: SSL/TLS
run_test "SSL/TLS Certificate" \
    "curl -s -I $API_URL/health | grep -q 'HTTP/2 200'"

# Test 6: Response Time (should be < 2 seconds)
run_test "Response Time" \
    "time_taken=\$(curl -s -o /dev/null -w '%{time_total}' $API_URL/health); [ \$(echo \"\$time_taken < 2.0\" | bc) -eq 1 ]"

# Test 7: Database Connection (via health check)
run_test "Database Connection" \
    "curl -s $API_URL/health | grep -q '\"database\":\"connected\"'"

# Test 8: Authentication Endpoint Exists
run_test "Authentication Endpoint" \
    "curl -f -s -o /dev/null -w '%{http_code}' -X POST $API_URL/auth/register -H 'Content-Type: application/json' -d '{}' | grep -q '400'"

# Test 9: Rate Limiting Headers
run_test "Rate Limiting Headers" \
    "curl -s -I $API_URL/health | grep -q 'X-RateLimit'"

# Test 10: Security Headers
run_test "Security Headers" \
    "curl -s -I $API_URL/health | grep -q 'X-Content-Type-Options: nosniff'"

echo "" | tee -a "$LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"
echo "Test Results" | tee -a "$LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}" | tee -a "$LOG_FILE"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}" | tee -a "$LOG_FILE"
echo "Log file: $LOG_FILE" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Exit with error if any tests failed
if [ $TESTS_FAILED -gt 0 ]; then
    echo -e "${RED}❌ Smoke tests failed!${NC}" | tee -a "$LOG_FILE"
    exit 1
else
    echo -e "${GREEN}✅ All smoke tests passed!${NC}" | tee -a "$LOG_FILE"
    exit 0
fi
