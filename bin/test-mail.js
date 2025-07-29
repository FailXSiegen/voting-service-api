#!/usr/bin/env node

// Test script for email configuration
const dotenv = require('dotenv');
const emailUtil = require('../src/lib/email-util.js').default;

dotenv.config();

async function testMail() {
  console.log('=== Email Configuration Test ===\n');
  
  // 1. Check environment variables
  console.log('1. Environment Variables:');
  console.log('   MAIL_HOST:', process.env.MAIL_HOST || '❌ NOT SET');
  console.log('   MAIL_PORT:', process.env.MAIL_PORT || '❌ NOT SET');
  console.log('   MAIL_USE_AUTH:', process.env.MAIL_USE_AUTH || '❌ NOT SET');
  console.log('   MAIL_AUTH_USER:', process.env.MAIL_AUTH_USER || '❌ NOT SET');
  console.log('   MAIL_AUTH_PASS:', process.env.MAIL_AUTH_PASS ? '✅ SET (hidden)' : '❌ NOT SET');
  console.log('   MAIL_USE_TLS:', process.env.MAIL_USE_TLS || '❌ NOT SET');
  console.log('   MAIL_USE_POOL:', process.env.MAIL_USE_POOL || '❌ NOT SET');
  console.log('   MAIL_DEFAULT_FROM:', process.env.MAIL_DEFAULT_FROM || '❌ NOT SET');
  console.log('   MAIL_ADMIN_EMAIL:', process.env.MAIL_ADMIN_EMAIL || '❌ NOT SET');
  console.log('\n');

  // 2. Initialize email transport
  console.log('2. Initializing email transport...');
  try {
    await emailUtil.init();
    console.log('   ✅ Email transport initialized successfully\n');
  } catch (error) {
    console.error('   ❌ Failed to initialize email transport:', error.message);
    process.exit(1);
  }

  // 3. Get test recipient
  const testRecipient = process.argv[2] || process.env.MAIL_ADMIN_EMAIL;
  if (!testRecipient) {
    console.error('❌ No test recipient specified!');
    console.log('\nUsage: node test-mail.js <recipient-email>');
    console.log('   or: Set MAIL_ADMIN_EMAIL environment variable');
    process.exit(1);
  }

  // 4. Send test email
  console.log(`3. Sending test email to: ${testRecipient}`);
  console.log('   From:', process.env.MAIL_DEFAULT_FROM || 'noreply@example.com');
  
  try {
    const testConfig = {
      from: process.env.MAIL_DEFAULT_FROM || 'noreply@example.com',
      to: testRecipient,
      subject: 'Voting Tool - Email Configuration Test',
      text: `This is a test email from the Voting Tool API.

Configuration Details:
- SMTP Host: ${process.env.MAIL_HOST}
- SMTP Port: ${process.env.MAIL_PORT}
- TLS Enabled: ${process.env.MAIL_USE_TLS === '1' ? 'Yes' : 'No'}
- Auth Enabled: ${process.env.MAIL_USE_AUTH === '1' ? 'Yes' : 'No'}
- Sent at: ${new Date().toISOString()}

If you receive this email, your email configuration is working correctly!`,
      html: `
        <h2>Voting Tool - Email Configuration Test</h2>
        <p>This is a test email from the Voting Tool API.</p>
        <h3>Configuration Details:</h3>
        <ul>
          <li><strong>SMTP Host:</strong> ${process.env.MAIL_HOST}</li>
          <li><strong>SMTP Port:</strong> ${process.env.MAIL_PORT}</li>
          <li><strong>TLS Enabled:</strong> ${process.env.MAIL_USE_TLS === '1' ? 'Yes' : 'No'}</li>
          <li><strong>Auth Enabled:</strong> ${process.env.MAIL_USE_AUTH === '1' ? 'Yes' : 'No'}</li>
          <li><strong>Sent at:</strong> ${new Date().toISOString()}</li>
        </ul>
        <p style="color: green;"><strong>If you receive this email, your email configuration is working correctly!</strong></p>
      `
    };

    await emailUtil.sendMail(testConfig);
    console.log('   ✅ Test email sent successfully!\n');
    console.log('4. Check your inbox for the test email.');
    
  } catch (error) {
    console.error('   ❌ Failed to send test email:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }

  process.exit(0);
}

// Run the test
testMail().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});