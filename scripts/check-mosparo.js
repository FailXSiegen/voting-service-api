// Run: node scripts/check-mosparo.js
// Expected values come from the official mosparo/php-api-client RequestHelper.
const assert = require('assert');
const http = require('http');
const { buildRequest, verifyMosparo } = require('../src/lib/mosparo');

const form = {
  username: 'max',
  email: 'a/b@example.test',
  publicName: 'Müller',
  publicOrganisation: 'V\r\nX',
};
const expected = JSON.parse(process.argv[2] || 'null');

(async () => {
  const request = buildRequest(form, 'submit/1', 'valid-2', 'private-key');
  if (expected) {
    assert.equal(request.body.formSignature, expected.formSignature);
    assert.equal(request.body.validationSignature, expected.validationSignature);
    assert.equal(request.verificationSignature, expected.verificationSignature);
    assert.equal(request.requestSignature, expected.requestSignature);
  }
  let reply = {};
  const server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => res.end(JSON.stringify(reply)));
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const settings = {
    mosparoEnabled: true,
    mosparoPublicKey: 'public',
    mosparoPrivateKey: 'private-key',
    mosparoHost: `http://localhost:${server.address().port}`,
  };
  const input = { formData: form, submitToken: 'submit/1', validationToken: 'valid-2' };
  const fields = Object.fromEntries(Object.keys(form).map((key) => [key, 'valid']));
  const check = async (response, ok, config = settings, payload = input) => {
    reply = response;
    assert.equal((await verifyMosparo(payload, config)).success, ok, JSON.stringify(response));
  };
  const good = {
    valid: true,
    verificationSignature: request.verificationSignature,
    verifiedFields: fields,
  };
  await check(good, true);
  await check({ ...good, valid: false }, false);
  await check({ ...good, verificationSignature: 'forged' }, false);
  await check({ ...good, verifiedFields: { ...fields, email: 'not-verified' } }, false);
  await check({ error: true, errorMessage: 'x' }, false);
  await check(good, false, settings, { ...input, submitToken: '' });
  await check(good, false, { ...settings, mosparoPrivateKey: '' });
  await check(good, true, { mosparoEnabled: false }, { formData: form });
  server.close();
  await check(good, false);
  console.log('mosparo ok' + (expected ? ' (matches php client)' : ''));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
