// ponytail: eine Prüfung für den Mailversand – rendert nodemailer + nodemailer-pug-engine
// noch HTML aus den Templates? Fängt Major-Bumps ab, die still leere Mails erzeugen.
// Aufruf: npm run test:mail
const nodemailer = require('nodemailer');
const { pugEngine } = require('nodemailer-pug-engine');
const assert = require('assert');

const transport = nodemailer.createTransport({ jsonTransport: true });
transport.use('compile', pugEngine({ templateDir: __dirname + '/../src/lib/emails', pretty: true }));

transport.sendMail(
  {
    from: 'noreply@digitalwahl.org',
    to: 'test@example.org',
    subject: 'Smoke',
    template: 'request-new-password',
    ctx: {
      username: 'Tester',
      link: 'https://example.org/reset',
      organisation: 'failx',
      imprint: 'https://example.org/impressum',
      dataprotection: 'https://example.org/datenschutz',
    },
  },
  (error, info) => {
    assert.ifError(error);
    const { html } = JSON.parse(info.message);
    assert.ok(html.includes('Tester'), 'Platzhalter username nicht gerendert: ' + html);
    assert.ok(html.includes('https://example.org/reset'), 'Platzhalter link nicht gerendert: ' + html);
    console.log('Mail-Smoke-Test OK (' + html.length + ' Zeichen HTML)');
  }
);
