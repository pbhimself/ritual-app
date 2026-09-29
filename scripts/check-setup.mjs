import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const exposedSecrets = Object.keys(process.env).filter((name) => name.startsWith('EXPO_PUBLIC_') && /SECRET|SERVICE_ROLE|NVIDIA|ANTHROPIC|PASSWORD/.test(name));
console.log(JSON.stringify({ publicSupabaseConfigured: Boolean(url && key), exposedSecretVariableNames: exposedSecrets }));
if (exposedSecrets.length) process.exitCode = 1;
if (url && key) {
  try {
    const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key }, signal: AbortSignal.timeout(10000) });
    const data = await response.json();
    console.log(JSON.stringify({ authSettingsStatus: response.status, googleEnabled: data.external?.google === true, emailEnabled: data.external?.email === true, emailConfirmationRequired: data.mailer_autoconfirm === false }));
  } catch (error) {
    console.log(JSON.stringify({ authSettingsReachable: false, error: error.name }));
    process.exitCode = 1;
  }
}
