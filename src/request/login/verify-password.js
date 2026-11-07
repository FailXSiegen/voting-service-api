import verifyPassword from '../../auth/login/login-verify-password';

export default async function requestVerifyPassword(req, res) {
  res.setHeader('content-type', 'application/json');
  let success = false;
  try {
    const { username, password } = req.body || {};
    // SEC-13/38: nur Strings, einheitliche Antwort für unbekannte Nutzer und falsche Passwörter.
    if (typeof username === 'string' && typeof password === 'string') {
      success = await verifyPassword(username, password);
    }
  } catch (error) {
    success = false;
  }
  res.send(
    JSON.stringify(
      success ? { success: true } : { success: false, error: { name: 'InvalidPasswordError' } }
    )
  );
}
