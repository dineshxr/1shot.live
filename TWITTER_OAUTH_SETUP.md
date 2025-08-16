# Twitter OAuth Setup Guide for SubmitHunt (submithunt.com)

## Current Status
- ✅ Local Supabase configuration is correct (`supabase/config.toml`)
- ✅ Environment variables are set (`.env`)
- ✅ Auth flow code is implemented
- ❌ **Twitter OAuth provider may still be disabled in Supabase Dashboard**
- ❌ **Twitter app callback URL needs verification**

## Required Fixes

### 1. Enable Twitter OAuth in Supabase Dashboard

**CRITICAL**: Enable Twitter OAuth in the Supabase dashboard and use environment variables for credentials (do not paste secrets in docs or code):

1. Go to: https://supabase.com/dashboard/project/lbayphzxmdtdmrqmeomt/auth/providers
2. Find "Twitter" in the providers list
3. Toggle it to "Enabled"
4. Configure credentials using `.env` variables:
   - `SUPABASE_AUTH_EXTERNAL_TWITTER_CLIENT_ID`
   - `SUPABASE_AUTH_EXTERNAL_TWITTER_SECRET`
5. Click "Save"
   
> Security note: Keep secrets only in `.env` and your Supabase project settings. Never commit secrets to source control.

### 2. Verify Twitter App Configuration

In your Twitter Developer Dashboard (https://developer.twitter.com/en/portal/dashboard):

1. **Callback URL**: Must be exactly `https://lbayphzxmdtdmrqmeomt.supabase.co/auth/v1/callback` (Supabase fixed callback)
2. **OAuth 2.0**: Must be enabled
3. **Request email from users**: Must be ON
4. **App type**: Must be "Web App"
5. **Website URL**: Use production domain `https://submithunt.com` and `http://localhost:8080` for local testing

### 3. Test the Authentication

After completing steps 1 and 2, test using:

- Local: `http://localhost:8080` (click "Submit Your Startup" and sign in with X/Twitter)
- Production: `https://submithunt.com`

If redirected to `/auth/callback`, ensure our callback page completes the code exchange and returns to `/`.
- Test page: http://localhost:8080/test-auth.html

## Current Configuration

### Supabase Project
- **Project ID**: `lbayphzxmdtdmrqmeomt`
- **URL**: `https://lbayphzxmdtdmrqmeomt.supabase.co`
- **Callback URL**: `https://lbayphzxmdtdmrqmeomt.supabase.co/auth/v1/callback`

### Twitter App Credentials
- **Client ID**: `LTVVc2JweTJWWkdWdGM2ejhFYXM6MTpjaQ`
- **Client Secret**: `JBfkYdoyUbYwESYgFyBCCU59qKq1DHXKQpKqqMEJNi_G20QFrY`

### Redirect URLs (Production)
- **Site URL**: `https://1shot.live`
- **Additional URLs**: 
  - `https://1shot.live/auth/callback`
  - `http://localhost:8080/auth/callback` (for testing)

## Troubleshooting

### Common Issues:
1. **404 Error**: Twitter provider not enabled in Supabase dashboard
2. **"No route matched"**: Incorrect callback URL in Twitter app
3. **CORS Error**: Incorrect site URL configuration
4. **Email not received**: "Request email from users" not enabled in Twitter app

### Debug Steps:
1. Check browser console for errors
2. Verify callback URL matches exactly
3. Ensure Twitter app is in production mode (not restricted)
4. Check Supabase auth logs in dashboard

## Files Updated
- ✅ `supabase/config.toml` - Auth configuration
- ✅ `src/lib/auth.js` - Auth service
- ✅ `src/components/login-modal.js` - Login UI
- ✅ `auth/callback.html` - OAuth callback handler
- ✅ `.env` - Environment variables

## Next Steps
1. **Enable Twitter OAuth in Supabase Dashboard** (CRITICAL)
2. **Verify Twitter app callback URL**
3. **Test authentication flow**
4. **Deploy to production with correct URLs**
