#!/usr/bin/env node

// Test script for email configuration
require('dotenv/config');
const nodemailer = require('nodemailer');

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

  // 2. Create transport
  console.log('2. Creating email transport...');
  
  let transportConfig = {
    host: process.env.MAIL_HOST,
    port: process.env.MAIL_PORT,
    pool: process.env.MAIL_USE_POOL === "1",
    secure: process.env.MAIL_PORT === "465", // SSL for port 465, STARTTLS for 587
    requireTLS: process.env.MAIL_USE_TLS === "1",
  };

  // Add auth if needed
  if (process.env.MAIL_USE_AUTH === "1") {
    transportConfig.auth = {
      user: process.env.MAIL_AUTH_USER,
      pass: process.env.MAIL_AUTH_PASS,
    };
  }

  // Add some debug options
  transportConfig.debug = true;
  transportConfig.logger = true;

  let transport;
  try {
    transport = nodemailer.createTransport(transportConfig);
    console.log('   ✅ Email transport created successfully\n');
  } catch (error) {
    console.error('   ❌ Failed to create email transport:', error.message);
    process.exit(1);
  }

  // 3. Verify connection
  console.log('3. Verifying SMTP connection...');
  try {
    await transport.verify();
    console.log('   ✅ SMTP connection verified successfully\n');
  } catch (error) {
    console.error('   ❌ SMTP connection failed:', error.message);
    console.error('\nPossible issues:');
    console.error('- Check if MAIL_HOST and MAIL_PORT are correct');
    console.error('- Verify firewall allows outbound connections on port', process.env.MAIL_PORT);
    console.error('- Check if authentication credentials are correct');
    console.error('- For Gmail/Office365, you might need app-specific passwords');
    process.exit(1);
  }

  // 4. Get test recipient
  const testRecipient = process.argv[2] || process.env.MAIL_ADMIN_EMAIL;
  if (!testRecipient) {
    console.error('❌ No test recipient specified!');
    console.log('\nUsage: node test-mail.js <recipient-email>');
    console.log('   or: Set MAIL_ADMIN_EMAIL environment variable');
    process.exit(1);
  }

  // 5. Send test email
  console.log(`4. Sending test email to: ${testRecipient}`);
  console.log('   From:', process.env.MAIL_DEFAULT_FROM || 'noreply@example.com');
  
  try {
    const info = await transport.sendMail({
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
    });

    console.log('   ✅ Test email sent successfully!');
    console.log('   Message ID:', info.messageId);
    console.log('   Response:', info.response);
    console.log('\n5. Check your inbox for the test email.');
    
  } catch (error) {
    console.error('   ❌ Failed to send test email:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }

  // Close transport
  transport.close();
  process.exit(0);
}

// Run the test
testMail().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});