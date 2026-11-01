// Server-side verification of a mosparo submission, same algorithm as the official
// mosparo/php-api-client. Fails closed: when mosparo is enabled, no verification means no signup.
const crypto = require('crypto');

const API_ENDPOINT = '/api/v1/verification/verify';
const DEFAULT_MOSPARO_HOST = 'https://captcha.failx.de';

const hmac = (data, key) => crypto.createHmac('sha256', key).update(data).digest('hex');
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
// PHP's json_encode escapes slashes; the signature has to match it.
const toJson = (data) => JSON.stringify(data).replace(/\//g, '\\/').replace(/\[\]/g, '{}');

function prepareFormData(formData) {
  const prepared = {};
  for (const key of Object.keys(formData).sort()) {
    prepared[key] = sha256(String(formData[key] ?? '').replace(/\r\n/g, '\n'));
  }
  return prepared;
}

function buildRequest(formData, submitToken, validationToken, privateKey) {
  const prepared = prepareFormData(formData);
  const formSignature = hmac(toJson(prepared), privateKey);
  const validationSignature = hmac(validationToken, privateKey);
  const body = { submitToken, validationSignature, formSignature, formData: prepared };
  return {
    body,
    requestSignature: hmac(API_ENDPOINT + toJson(body), privateKey),
    verificationSignature: hmac(validationSignature + formSignature, privateKey),
  };
}

async function verifyMosparo({ formData, submitToken, validationToken }, settings) {
  if (!settings?.mosparoEnabled) return { skipped: true, success: true };
  const { mosparoPublicKey: publicKey, mosparoPrivateKey: privateKey } = settings;
  if (!publicKey || !privateKey) return { success: false, reason: 'missing-keys' };
  if (!submitToken || !validationToken) return { success: false, reason: 'missing-token' };

  const { body, requestSignature, verificationSignature } = buildRequest(
    formData,
    submitToken,
    validationToken,
    privateKey
  );
  const host = (settings.mosparoHost || DEFAULT_MOSPARO_HOST).replace(/\/+$/, '');
  try {
    const response = await fetch(host + API_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${publicKey}:${requestSignature}`).toString('base64')}`,
      },
      body: toJson(body),
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json();
    if (!result.valid || result.verificationSignature !== verificationSignature) {
      return { success: false, reason: result.errorMessage || 'invalid' };
    }
    // A bot could pass the check with empty fields, so every filled field must be verified.
    const unverified = Object.keys(formData).filter(
      (field) => formData[field] && result.verifiedFields?.[field] !== 'valid'
    );
    return unverified.length
      ? { success: false, reason: `unverified: ${unverified.join(',')}` }
      : { success: true };
  } catch (error) {
    console.error('[mosparo] verification failed:', error.message);
    return { success: false, reason: 'network-error' };
  }
}

module.exports = { verifyMosparo, buildRequest, DEFAULT_MOSPARO_HOST };
