#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# If run from Desktop root, cd into project directory
if [ ! -f "$DIR/package.json" ] && [ -d "$DIR/HouseOfSadaya-POS" ]; then
  cd "$DIR/HouseOfSadaya-POS"
fi

echo "=========================================="
echo "   HOUSE OF SADAYA - BOUTIQUE POS         "
echo "=========================================="
echo "Starting backend server & billing screen..."
echo ""

./launch-pos.sh

echo ""
echo "=========================================="
echo "✅ POS System is RUNNING!"
echo "   Billing UI: http://localhost:5173"
echo "   Backend:    http://localhost:3001"
echo "=========================================="
echo "Staff Login PINs:"
echo " - Rahul Sharma (Cashier):    1234"
echo " - Priya Patel (Cashier):     5678"
echo " - Sister / Owner (Admin):    9999"
echo "=========================================="
echo ""
echo "Keep this window open during business hours."
echo "Close window or press Ctrl+C to stop."
