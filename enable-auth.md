# Enable Firebase Authentication

Firebase Authentication must be enabled before users can be created.

## Quick Steps:

1. **Open Firebase Console:**
   https://console.firebase.google.com/project/realyn-app/authentication/providers

2. **Enable Email/Password:**
   - Click on "Email/Password" in the providers list
   - Toggle "Enable" to ON
   - Click "Save"

3. **Run the seed function again:**
   ```bash
   curl -X POST https://us-central1-realyn-app.cloudfunctions.net/seedUsersHandler
   ```

## Alternative: Enable via Firebase CLI (if you have the right permissions)

```bash
# This may not work without proper IAM permissions
firebase auth:export /dev/null 2>&1 | head -1
```

If the above command works, Auth is already enabled. If not, use the Console method above.

