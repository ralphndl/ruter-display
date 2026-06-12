#!/bin/bash

# Setup script for Ruter Display
# Run this on a fresh Raspberry Pi installation

echo "🚀 Setting up Ruter Display..."
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
  echo "❌ Node.js is not installed"
  echo "Please install Node.js first:"
  echo "  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -"
  echo "  sudo apt-get install -y nodejs"
  exit 1
fi

echo "✓ Node.js $(node --version) found"
echo "✓ npm $(npm --version) found"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install
echo "✓ Dependencies installed"
echo ""

# Clean workspace
echo "🧹 Cleaning workspace..."
./clean.sh
echo ""

echo "✅ Setup complete!"
echo ""
echo "🎯 To start the server, run:"
echo "   node server.js"
echo ""
echo "📱 Then access the app at:"
echo "   http://localhost:3030?stopId=NSR:StopPlace:58305"
echo ""
echo "💡 Available stop IDs:"
echo "   - Disen: NSR:StopPlace:58305"
echo "   - Storo: NSR:StopPlace:58195"
