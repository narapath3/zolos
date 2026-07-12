#!/bin/bash

# Diagnostic script for Zolos Multiplayer
# Usage: ./check_multiplayer.sh <RAILWAY_URL>

if [ -z "$1" ]; then
    echo "Usage: ./check_multiplayer.sh <RAILWAY_URL>"
    echo "Example: ./check_multiplayer.sh https://zolos-production.up.railway.app"
    exit 1
fi

URL=$1
HEALTH_URL="${URL%/}/health"

echo "--- Zolos Multiplayer Diagnostic ---"
echo "Checking Server: $URL"
echo "Health Endpoint: $HEALTH_URL"
echo ""

# 1. Check if server is reachable
echo "[1/3] Testing Connectivity..."
RESPONSE=$(curl -s -L -w "\n%{http_code}" "$HEALTH_URL")
HTTP_STATUS=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_STATUS" -eq 200 ]; then
    echo "✅ Server is UP (HTTP 200)"
    echo "Response: $BODY"
else
    echo "❌ Server returned error (HTTP $HTTP_STATUS)"
    echo "Note: If it returns 404 or HTML, the Root Directory might still be wrong."
    exit 1
fi

# 2. Check Socket.io availability
echo ""
echo "[2/3] Checking Socket.io Engine..."
SOCKET_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$URL/socket.io/?EIO=4&transport=polling")
if [ "$SOCKET_STATUS" -eq 200 ]; then
    echo "✅ Socket.io engine is responding"
else
    echo "❌ Socket.io engine is NOT responding (HTTP $SOCKET_STATUS)"
fi

# 3. Verify CORS (Simulating Vercel Origin)
echo ""
echo "[3/3] Testing CORS (Simulating Vercel)..."
CORS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Origin: https://zolos.vercel.app" -H "Access-Control-Request-Method: GET" -X OPTIONS "$URL/socket.io/")
if [ "$CORS_STATUS" -eq 204 ] || [ "$CORS_STATUS" -eq 200 ]; then
    echo "✅ CORS appears to be configured correctly"
else
    echo "⚠️ CORS check returned $CORS_STATUS. Ensure CORS_ORIGIN is set in Railway."
fi

echo ""
echo "Diagnostic Complete."
