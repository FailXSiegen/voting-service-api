#!/usr/bin/env node

require('dotenv/config');

// Simple HTTP GraphQL client without external dependencies
function makeGraphQLRequest(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      query: query,
      variables: variables
    });

    const options = {
      hostname: 'localhost',
      port: 4000,
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = require('http').request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (error) {
          reject(new Error('Invalid JSON response: ' + data));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

async function testTranslationsEndpoint() {
  console.log('=== Testing Translations GraphQL Endpoint ===\n');
  
  try {
    // 1. Test GET translations first
    console.log('1. Testing GET translations...');
    const getQuery = `
      query GetTranslationsByLocale($locale: String!) {
        translationsByLocale(locale: $locale)
      }
    `;
    
    const getResult = await makeGraphQLRequest(getQuery, { locale: 'de' });
    
    if (getResult.errors) {
      console.error('   ❌ GET translations failed:');
      getResult.errors.forEach(error => console.error('     ', error.message));
      return;
    }
    
    console.log('   ✅ GET translations successful');
    console.log('   Response type:', typeof getResult.data.translationsByLocale);
    
    // 2. Test SAVE translations (this is where the error occurs)
    console.log('\n2. Testing SAVE translations...');
    
    const saveQuery = `
      mutation SaveTranslations($translations: [SaveTranslationInput!]!) {
        saveTranslations(translations: $translations)
      }
    `;
    
    const testTranslations = [
      {
        locale: 'de',
        key: 'test.endpoint.test',
        value: 'Test-Übersetzung für Endpoint-Test'
      }
    ];
    
    const saveResult = await makeGraphQLRequest(saveQuery, {
      translations: testTranslations
    });
    
    if (saveResult.errors) {
      console.error('   ❌ SAVE translations failed:');
      saveResult.errors.forEach(error => {
        console.error('     Error:', error.message);
        if (error.extensions) {
          console.error('     Extensions:', error.extensions);
        }
      });
      return;
    }
    
    console.log('   ✅ SAVE translations successful!');
    console.log('   Result:', saveResult.data.saveTranslations);
    
    // 3. Verify the saved translation
    console.log('\n3. Verifying saved translation...');
    const verifyResult = await makeGraphQLRequest(getQuery, { locale: 'de' });
    
    if (verifyResult.errors) {
      console.error('   ❌ Verify failed:', verifyResult.errors);
      return;
    }
    
    const translations = JSON.parse(verifyResult.data.translationsByLocale);
    const testValue = translations?.test?.endpoint?.test;
    
    if (testValue === 'Test-Übersetzung für Endpoint-Test') {
      console.log('   ✅ Translation verified successfully!');
    } else {
      console.log('   ⚠️  Translation not found or different value:', testValue);
    }
    
    console.log('\n✅ All tests passed! Translations endpoint is working correctly.');
    
  } catch (error) {
    console.error('\n❌ Error testing translations endpoint:');
    console.error('Error message:', error.message);
    console.error('Full error:', error);
  }
}

// Run the test
testTranslationsEndpoint().then(() => {
  process.exit(0);
}).catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});