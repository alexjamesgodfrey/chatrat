#!/usr/bin/env node

/**
 * Test script to validate the authentication and proxy setup
 * Run with: node test-setup.js
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

async function testServerHealth() {
  console.log('🔍 Testing server health...');
  try {
    const response = await axios.get(`${SERVER_URL}/healthz`, { timeout: 5000 });
    console.log('✅ Server is healthy');
    console.log('📊 Service status:', response.data.services);
    return true;
  } catch (error) {
    console.log('❌ Server health check failed:', error.message);
    return false;
  }
}

async function testGitHubOAuth() {
  console.log('\n🔍 Testing GitHub OAuth configuration...');
  try {
    const response = await axios.get(`${SERVER_URL}/auth/github`, { 
      maxRedirects: 0,
      validateStatus: (status) => status === 302
    });
    
    if (response.status === 302 && response.headers.location?.includes('github.com')) {
      console.log('✅ GitHub OAuth redirect is working');
      return true;
    } else {
      console.log('❌ GitHub OAuth redirect failed');
      return false;
    }
  } catch (error) {
    if (error.response?.status === 302) {
      console.log('✅ GitHub OAuth redirect is working');
      return true;
    }
    console.log('❌ GitHub OAuth test failed:', error.message);
    return false;
  }
}

async function testUnauthenticatedAccess() {
  console.log('\n🔍 Testing unauthenticated access protection...');
  try {
    const response = await axios.get(`${SERVER_URL}/api/agentdb/databases`);
    console.log('❌ Unauthenticated access should be blocked');
    return false;
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('✅ Unauthenticated access is properly blocked');
      return true;
    }
    console.log('❌ Unexpected error:', error.message);
    return false;
  }
}

function checkServerFiles() {
  console.log('\n🔍 Checking server files...');
  const requiredFiles = [
    'apps/server/package.json',
    'apps/server/tsconfig.json',
    'apps/server/api/index.ts',
    'apps/server/.env.example'
  ];
  
  let allFilesExist = true;
  
  for (const file of requiredFiles) {
    if (fs.existsSync(file)) {
      console.log(`✅ ${file} exists`);
    } else {
      console.log(`❌ ${file} is missing`);
      allFilesExist = false;
    }
  }
  
  return allFilesExist;
}

function checkExtensionFiles() {
  console.log('\n🔍 Checking extension files...');
  const requiredFiles = [
    'apps/extension/package.json',
    'apps/extension/src/extension.ts',
    'apps/extension/src/authService.ts',
    'apps/extension/src/proxyService.ts'
  ];
  
  let allFilesExist = true;
  
  for (const file of requiredFiles) {
    if (fs.existsSync(file)) {
      console.log(`✅ ${file} exists`);
    } else {
      console.log(`❌ ${file} is missing`);
      allFilesExist = false;
    }
  }
  
  return allFilesExist;
}

function checkEnvironmentSetup() {
  console.log('\n🔍 Checking environment setup...');
  
  const envPath = 'apps/server/.env';
  if (!fs.existsSync(envPath)) {
    console.log('⚠️  .env file not found. Please copy .env.example to .env and configure it.');
    return false;
  }
  
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const requiredVars = [
    'GITHUB_CLIENT_ID',
    'GITHUB_CLIENT_SECRET',
    'AGENTDB_TOKEN',
    'AGENTDB_API_KEY',
    'SESSION_SECRET'
  ];
  
  let allVarsSet = true;
  
  for (const varName of requiredVars) {
    const regex = new RegExp(`^${varName}=.+`, 'm');
    if (regex.test(envContent) && !envContent.includes(`${varName}=your_`)) {
      console.log(`✅ ${varName} is configured`);
    } else {
      console.log(`❌ ${varName} needs to be configured`);
      allVarsSet = false;
    }
  }
  
  return allVarsSet;
}

function checkPackageInstallation() {
  console.log('\n🔍 Checking package installations...');
  
  const serverNodeModules = 'apps/server/node_modules';
  const extensionNodeModules = 'apps/extension/node_modules';
  
  let installationsOk = true;
  
  if (fs.existsSync(serverNodeModules)) {
    console.log('✅ Server dependencies installed');
  } else {
    console.log('❌ Server dependencies not installed. Run: cd apps/server && npm install');
    installationsOk = false;
  }
  
  if (fs.existsSync(extensionNodeModules)) {
    console.log('✅ Extension dependencies installed');
  } else {
    console.log('❌ Extension dependencies not installed. Run: cd apps/extension && npm install');
    installationsOk = false;
  }
  
  return installationsOk;
}

async function runTests() {
  console.log('🚀 Starting authentication and proxy setup validation...\n');
  
  const results = {
    serverFiles: checkServerFiles(),
    extensionFiles: checkExtensionFiles(),
    packageInstallation: checkPackageInstallation(),
    environmentSetup: checkEnvironmentSetup(),
    serverHealth: false,
    githubOAuth: false,
    authProtection: false
  };
  
  // Only run server tests if basic setup is complete
  if (results.serverFiles && results.packageInstallation && results.environmentSetup) {
    console.log('\n🌐 Running server tests...');
    results.serverHealth = await testServerHealth();
    
    if (results.serverHealth) {
      results.githubOAuth = await testGitHubOAuth();
      results.authProtection = await testUnauthenticatedAccess();
    }
  } else {
    console.log('\n⚠️  Skipping server tests due to setup issues');
  }
  
  // Summary
  console.log('\n📋 Test Summary:');
  console.log('================');
  
  const testResults = [
    ['Server Files', results.serverFiles],
    ['Extension Files', results.extensionFiles],
    ['Package Installation', results.packageInstallation],
    ['Environment Setup', results.environmentSetup],
    ['Server Health', results.serverHealth],
    ['GitHub OAuth', results.githubOAuth],
    ['Auth Protection', results.authProtection]
  ];
  
  let passedTests = 0;
  const totalTests = testResults.length;
  
  for (const [testName, passed] of testResults) {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${testName}`);
    if (passed) passedTests++;
  }
  
  console.log(`\n🎯 Results: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('\n🎉 All tests passed! Your setup is ready.');
    console.log('\nNext steps:');
    console.log('1. Start the server: cd apps/server && npm run dev');
    console.log('2. Open VSCode and press F5 to test the extension');
    console.log('3. Try authenticating with GitHub');
  } else {
    console.log('\n⚠️  Some tests failed. Please check the issues above.');
    console.log('\nRefer to AUTHENTICATION_SETUP.md for detailed setup instructions.');
  }
  
  process.exit(passedTests === totalTests ? 0 : 1);
}

// Run the tests
runTests().catch(error => {
  console.error('❌ Test runner failed:', error);
  process.exit(1);
});
