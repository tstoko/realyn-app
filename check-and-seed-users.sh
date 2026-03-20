#!/bin/bash

echo "🔍 Checking Firebase Authentication status..."
echo ""

# Try to seed users
RESPONSE=$(curl -s -X POST https://us-central1-realyn-app.cloudfunctions.net/seedUsersHandler)

if echo "$RESPONSE" | grep -q "success.*true"; then
    echo "✅ SUCCESS! Users have been seeded."
    echo ""
    echo "You can now log in with:"
    echo "  - admin@realyn.com / masterpass"
    echo "  - user1@gph.com / password123"
    echo "  - user2@lakeside.com / password123"
    echo "  - user3@mbi.com / password123"
    exit 0
elif echo "$RESPONSE" | grep -q "configuration-not-found\|must be enabled"; then
    echo "❌ Firebase Authentication is NOT enabled yet."
    echo ""
    echo "📋 Please enable it now:"
    echo ""
    echo "1. Open: https://console.firebase.google.com/project/realyn-app/authentication/providers"
    echo "2. Click on 'Email/Password'"
    echo "3. Toggle 'Enable' to ON"
    echo "4. Click 'Save'"
    echo "5. Wait 10 seconds"
    echo ""
    echo "Then run this script again: ./check-and-seed-users.sh"
    exit 1
else
    echo "⚠️  Unexpected response:"
    echo "$RESPONSE"
    exit 1
fi

