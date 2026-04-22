#!/usr/bin/env bash
# Restoration Script: Start local services for P3 Lending Protocol

echo "🚀 RESTORING P3 LENDING LOCALLY..."
mkdir -p .logs

# 1. Kill any existing processes on our target ports
echo "🧹 Cleaning up ports 5001 and 5173..."
lsof -ti :5001,5173 | xargs kill -9 2>/dev/null || true

# 2. Check for port 5000 AirPlay conflict (Warn only)
if lsof -i :5000 | grep -q AirTunes; then
  echo "⚠️  Detected macOS AirPlay Receiver on port 5000. Backend will use 5001."
fi

# 3. Start Backend
echo "📡 Starting Backend (Port 5001)..."
npm --prefix server run dev > .logs/backend-restore.log 2>&1 &
BACKEND_PID=$!

# 4. Start Frontend
echo "🌐 Starting Frontend (Port 5173)..."
npm run dev -- --host 0.0.0.0 --port 5173 > .logs/frontend-restore.log 2>&1 &
FRONTEND_PID=$!

echo "✅ Services started!"
echo "   - Backend PID: $BACKEND_PID (Check .logs/backend-restore.log)"
echo "   - Frontend PID: $FRONTEND_PID (Check .logs/frontend-restore.log)"
echo ""
echo "🔗 NEXT STEPS FOR REROUTING:"
echo "   1. Run: ./cloudflared tunnel run p3-restore"
echo "   2. Ensure Cloudflare DNS points p3lending.space to this tunnel."
echo "   3. Update .env: VITE_BACKEND_URL=https://api.p3lending.space"

# 5. Start Tor Hidden Service
echo "🧅 Starting Tor Hidden Service..."
mkdir -p tor_service
nohup "/Applications/Tor Browser.app/Contents/MacOS/Tor/tor" -f ./torrc > .logs/tor.log 2>&1 &
TOR_PID=$!
echo "✅ Tor PID: $TOR_PID"
echo "   (Wait 60s for Tor to initialize and create your onion address in ./tor_service/hostname)"
