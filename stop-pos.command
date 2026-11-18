#!/bin/bash
echo "=========================================="
echo "   STOPPING HOUSE OF SADAYA POS...        "
echo "=========================================="

pkill -f "node.*server/index.js" 2>/dev/null
pkill -f "vite.*5173" 2>/dev/null
lsof -ti:3001 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null

echo "✅ POS System stopped safely."
sleep 1.5
