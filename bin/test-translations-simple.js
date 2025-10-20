#!/usr/bin/env node

require('dotenv/config');

async function testTranslationsSimple() {
  console.log('=== Simple Translations Resolver Test ===\n');
  
  try {
    // Import the resolver directly (relative path to dist)
    const translationsResolver = require('../dist/graphql/resolver/translations-resolver');
    const TranslationRepository = require('../dist/repository/translation-repository');
    
    console.log('1. Testing resolver import...');
    console.log('   Resolver imported:', typeof translationsResolver);
    console.log('   Has Query:', !!translationsResolver.Query);
    console.log('   Has Mutation:', !!translationsResolver.Mutation);
    console.log('   Has saveTranslations:', !!translationsResolver.Mutation?.saveTranslations);
    
    console.log('\n2. Testing repository import...');
    console.log('   Repository imported:', typeof TranslationRepository);
    console.log('   Has saveTranslations method:', typeof TranslationRepository.saveTranslations);
    
    // Test a simple query first
    console.log('\n3. Testing translationsByLocale query...');
    const mockContext = {};
    const queryResult = await translationsResolver.Query.translationsByLocale(
      null, 
      { locale: 'de' }, 
      mockContext
    );
    console.log('   Query result type:', typeof queryResult);
    console.log('   Query successful: ✅');
    
    // Test saveTranslations mutation
    console.log('\n4. Testing saveTranslations mutation...');
    
    // Create mock context with admin user
    const mockAdminContext = {
      user: {
        organizer: {
          id: 1,
          superAdmin: true
        }
      }
    };
    
    const testTranslations = [
      {
        locale: 'de',
        key: 'test.simple.test',
        value: 'Einfacher Test-Wert'
      }
    ];
    
    const mutationResult = await translationsResolver.Mutation.saveTranslations(
      null,
      { translations: testTranslations },
      mockAdminContext
    );
    
    console.log('   Mutation result:', mutationResult);
    console.log('   Mutation successful: ✅');
    
    console.log('\n✅ All direct resolver tests passed!');
    console.log('\nThe resolver and repository are working correctly.');
    console.log('The issue is likely in the GraphQL transport layer or Apollo Client.');
    
  } catch (error) {
    console.error('\n❌ Error in direct resolver test:');
    console.error('Error message:', error.message);
    console.error('Stack trace:', error.stack);
    
    if (error.name === 'AuthenticationError') {
      console.log('\n💡 This might be an authentication issue.');
      console.log('   Make sure the user is logged in and has admin permissions.');
    }
  }
}

// Run the test
testTranslationsSimple().then(() => {
  process.exit(0);
}).catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});