# Rituals Setup and Verification

## Google Sign-In: Required Owner Setup

The live Supabase project currently has Google **disabled**. The app has PKCE callback handling and restores valid sessions automatically, but Google must be enabled using credentials from your Google Cloud project. The first login still requires the user's Google consent; this cannot safely be bypassed.

1. In [Google Auth Platform](https://console.cloud.google.com/auth/overview), configure the app branding, audience and consent screen. Request only `openid`, email and profile scopes. Add your Google account as a test user while the app is in testing.
2. Create an OAuth client of type **Web application**. This app uses the Supabase browser OAuth flow on both web and native, not the native Google SDK.
3. Add your production HTTPS website origin under **Authorized JavaScript origins**. During development, also add `http://localhost:8083`.
4. Add this exact **Authorized redirect URI** in Google:

   ```text
   https://jzdrckmocagdhmlksnmz.supabase.co/auth/v1/callback
   ```

5. In [Supabase Auth Providers](https://supabase.com/dashboard/project/jzdrckmocagdhmlksnmz/auth/providers), open Google, enter the Client ID and Client Secret, enable it, and save. Keep the secret only in the provider dashboard, never in `EXPO_PUBLIC_*`, Git, or client code.
6. In Supabase Authentication > URL Configuration, set **Site URL** to your production HTTPS website and add the exact allowed redirect URLs below. Replace `<your-production-host>` with the actual deployed host:

   ```text
   https://<your-production-host>/auth/callback
   https://<your-production-host>/
   http://localhost:8083/auth/callback
   http://localhost:8083/
   com.pratikbhangale.rituals://auth/callback
   ```

Use exact production URLs, not broad wildcard redirects. Remove local URLs from the production project when development uses a separate project. Google receives the Supabase callback URL; Supabase redirects back to the app URL. Do not interchange them.

Official reference: [Supabase Google sign-in setup](https://supabase.com/docs/guides/auth/social-login/auth-google).

## Build and Session Setup

- Public client configuration needs only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or the legacy anon key).
- Native sessions now use encrypted SecureStore, with chunking for large OAuth sessions. Existing AsyncStorage sessions migrate on first access. Passwords are not retained in account cache copies.
- Rebuild the native app after installing SecureStore. An OTA JavaScript update alone cannot install a native module. Use `npm run build:android:apk` with a configured EAS account, or `npm run android` for a local development build. Test Google callbacks in an installed development/release build, not Expo Go.
- Deploy the web build with the updated `vercel.json`; the callback route must serve `index.html`. Client updates and security headers are not automatically live just because the Supabase functions were deployed.
- Email/password sign-in now requires an email address. Usernames remain profile identifiers. The public username-to-email RPC has been revoked to stop email enumeration.
- `test` / `test` is development-only and cannot log into a release build.

## AI Configuration and Current Limitation

Set `NVIDIA_API_KEY` in Supabase Edge Function secrets. `NVIDIA_MODEL` is optional; the current default is `moonshotai/kimi-k3`. Coach/report generation also supports `ANTHROPIC_API_KEY` and optional `ANTHROPIC_MODEL` as a fallback. Never expose provider keys or the service-role key using an `EXPO_PUBLIC_` prefix.

Live verification on 2026-09-25 found repeated provider timeouts. The authenticated coach endpoint returned 503; check-in/report endpoints returned usable fallback results. Do not treat fallback text as proof of a live model reply. Check provider quota/availability and run the diagnostics below after updating secrets. A faster model should be selected only after testing that your provider account supports it; one older Llama endpoint returned HTTP 410.

```powershell
npm run check:setup
node --experimental-strip-types scripts/check-ai.mjs
node scripts/check-ai.mjs --models
```

`check:setup` reports Google enablement without printing keys. `check-ai` makes one small request with synthetic ritual data; it does not configure cloud secrets. Local `.env` secrets are not automatically uploaded to Supabase.

## Security Settings Still Required

- Enable **leaked-password protection** in Supabase Auth, where supported by your plan. This remains the only warning from the live security advisor after the username lookup fix. See [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Keep email confirmation enabled; configure a production SMTP provider and verify real signup/reset delivery. PKCE email links must be opened on the browser/device that requested them.
- Review auth rate limits, provider spend limits and per-user AI abuse controls before public launch. Authentication is enforced, but this is not a complete abuse-prevention or penetration-testing audit.
- The dependency audit currently has 15 moderate findings and no high/critical findings. The high XML-parser issue was updated. Avoid `npm audit fix --force`, which proposes incompatible Expo changes; reassess moderate transitive fixes against Expo 57.
- Rotate any server credentials previously shared publicly. Web sessions remain subject to browser/XSS security; SecureStore encryption applies to native sessions.

## Verification Commands

```powershell
npm run typecheck
npm test
npm run web -- --port 8083
npm run test:ui
npm run build:web
node scripts/verify-backend.mjs --live
```

The browser tests use isolated browser storage and the development-only local account. The opt-in live backend test creates two disposable `example.invalid` accounts using `SUPABASE_SERVICE_ROLE_KEY`, checks owned-data CRUD and cross-user isolation, makes a few AI requests, and deletes those generated accounts in `finally`. It does not read or alter existing users' records. A provider failure makes the run exit nonzero even when data/security checks pass.

Applied backend work includes revoking username lookup, reconciling report columns and the unique report-window index, and deploying corrected check-in/report functions. Local migration history also includes the previously applied sleep-fields migration.

Real Google consent, production email delivery, native keychain migration, device notifications, and native PDF sharing still require acceptance tests on the actual deployment/devices. No automated test can guarantee that every network, device or future provider response will be problem-free.
