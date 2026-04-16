import SystemSettingsRepository from '../repository/system-settings-repository';

const SITEVERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

export async function verifyRecaptcha(token) {
  let settings;
  try {
    settings = await SystemSettingsRepository.getSettings();
  } catch (error) {
    console.error('[reCAPTCHA] Failed to load system settings:', error);
    return { skipped: true, success: true };
  }

  if (!settings || !settings.recaptchaEnabled) {
    return { skipped: true, success: true };
  }

  const secret = settings.recaptchaSecretKey;
  if (!secret) {
    console.warn('[reCAPTCHA] Enabled but no secret key configured — rejecting request.');
    return { skipped: false, success: false, reason: 'missing-secret' };
  }

  if (!token) {
    return { skipped: false, success: false, reason: 'missing-token' };
  }

  try {
    const body = new URLSearchParams({ secret, response: token }).toString();
    const response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await response.json();
    if (!data.success) {
      console.warn('[reCAPTCHA] siteverify rejected token:', data['error-codes']);
    }
    return { skipped: false, success: Boolean(data.success), reason: data['error-codes'] };
  } catch (error) {
    console.error('[reCAPTCHA] siteverify call failed:', error);
    return { skipped: false, success: false, reason: 'network-error' };
  }
}
