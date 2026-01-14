/**
 * Automated Import Test Runner
 * 
 * Tests the contacts import feature end-to-end via API calls.
 * Run with: node run-import-tests.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Configuration
const API_BASE = process.env.API_BASE || 'http://localhost:3001';
const TEST_DATA_DIR = './contact_import';
const AUTH_TOKEN = process.env.AUTH_TOKEN || ''; // Set via env or log in to get token

// Test cases definition
const TEST_CASES = [
    {
        name: 'success_basic_contacts',
        format: 'csv',
        expectedValidRows: 4,
        expectedInvalidRows: 0,
        expectedDuplicateRows: 0,
        description: 'Basic import with valid contacts (CSV)',
    },
    {
        name: 'success_basic_contacts',
        format: 'xlsx',
        expectedValidRows: 4,
        expectedInvalidRows: 0,
        expectedDuplicateRows: 0,
        description: 'Basic import with valid contacts (XLSX)',
    },
    {
        name: 'success_email_only_contacts',
        format: 'csv',
        expectedValidRows: 3,
        expectedInvalidRows: 0,
        expectedDuplicateRows: 0,
        description: 'Import contacts with email only, no phone (CSV)',
    },
    {
        name: 'success_email_only_contacts',
        format: 'xlsx',
        expectedValidRows: 3,
        expectedInvalidRows: 0,
        expectedDuplicateRows: 0,
        description: 'Import contacts with email only, no phone (XLSX)',
    },
    {
        name: 'failure_missing_required_fields',
        format: 'csv',
        expectedValidRows: 1,
        expectedInvalidRows: 2,
        expectedDuplicateRows: 0,
        description: 'Import with missing first name (CSV)',
    },
    {
        name: 'failure_invalid_email_formats',
        format: 'csv',
        expectedValidRows: 1,
        expectedInvalidRows: 2,
        expectedDuplicateRows: 0,
        description: 'Import with invalid email formats (CSV)',
    },
    {
        name: 'failure_invalid_phone_formats',
        format: 'csv',
        expectedValidRows: 1,
        expectedInvalidRows: 2,
        expectedDuplicateRows: 0,
        description: 'Import with invalid phone formats (CSV)',
    },
    {
        name: 'mixed_valid_and_invalid_contacts',
        format: 'csv',
        expectedValidRows: 3,
        expectedInvalidRows: 2,
        expectedDuplicateRows: 0,
        description: 'Mix of valid and invalid rows (CSV)',
    },
    {
        name: 'unexpected_headers',
        format: 'csv',
        expectedValidRows: 0,
        expectedInvalidRows: 0,
        expectedDuplicateRows: 0,
        description: 'Spanish headers - manual mapping required (CSV)',
        requiresManualMapping: true,
    },
    {
        name: 'empty_and_whitespace_rows',
        format: 'csv',
        expectedValidRows: 1,
        expectedInvalidRows: 0,
        expectedDuplicateRows: 0,
        description: 'Skip empty and whitespace rows (CSV)',
    },
];

// HTTP request helper
function apiRequest(method, path, body = null, token = AUTH_TOKEN) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, API_BASE);
        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(token && { Authorization: `Bearer ${token}` }),
            },
        };

        const client = url.protocol === 'https:' ? https : http;
        const req = client.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null });
                } catch {
                    resolve({ status: res.statusCode, data });
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

// Upload file to presigned URL
function uploadToS3(uploadUrl, filePath) {
    return new Promise((resolve, reject) => {
        const fileContent = fs.readFileSync(filePath);
        const url = new URL(uploadUrl);

        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: 'PUT',
            headers: {
                'Content-Type': 'application/octet-stream',
                'Content-Length': fileContent.length,
            },
        };

        const client = url.protocol === 'https:' ? https : http;
        const req = client.request(options, (res) => {
            resolve({ status: res.statusCode });
        });

        req.on('error', reject);
        req.write(fileContent);
        req.end();
    });
}

// Wait and poll for job status
async function waitForJobStatus(jobId, targetStatuses, maxAttempts = 60) {
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const { data: job } = await apiRequest('GET', `/import-jobs/${jobId}`);

        if (targetStatuses.includes(job.status)) {
            return job;
        }
        if (job.status === 'FAILED') {
            throw new Error(`Job failed: ${job.errorMessage}`);
        }
    }
    throw new Error('Timeout waiting for job status');
}

// Auto-detect mapping for standard headers
function getAutoMapping(headers) {
    const mapping = {};
    headers.forEach((header) => {
        const normalized = header.toLowerCase().replace(/[_\s-]/g, '');
        if (normalized.includes('first') || normalized === 'nombre') {
            mapping[header] = 'first_name';
        } else if (normalized.includes('last') || normalized === 'apellido') {
            mapping[header] = 'last_name';
        } else if (normalized.includes('phone') || normalized.includes('tel') || normalized === 'telefono') {
            mapping[header] = 'phone_number';
        } else if (normalized.includes('email') || normalized.includes('mail') || normalized === 'correo') {
            mapping[header] = 'email';
        } else if (normalized.includes('country') || normalized.includes('code')) {
            mapping[header] = 'country_code';
        } else if (normalized.includes('lang') || normalized === 'idioma') {
            mapping[header] = 'language';
        }
    });
    return mapping;
}

// Run a single test case
async function runTestCase(testCase) {
    const { name, format, expectedValidRows, expectedInvalidRows, expectedDuplicateRows, description, requiresManualMapping } = testCase;
    const filename = `${name}.${format}`;
    const filePath = path.join(TEST_DATA_DIR, filename);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`TEST: ${description}`);
    console.log(`File: ${filename}`);
    console.log('='.repeat(60));

    try {
        // Step 1: Create job
        console.log('1. Creating import job...');
        const { data: createRes } = await apiRequest('POST', '/import-jobs', { originalFilename: filename });
        const { jobId, uploadUrl } = createRes;
        console.log(`   Job ID: ${jobId}`);

        // Step 2: Upload file
        console.log('2. Uploading file to S3...');
        await uploadToS3(uploadUrl, filePath);
        console.log('   Upload complete');

        // Step 3: Notify upload complete
        console.log('3. Notifying backend...');
        await apiRequest('POST', `/import-jobs/${jobId}/upload-complete`);

        // Step 4: Wait for parsing
        console.log('4. Waiting for parsing...');
        const parsedJob = await waitForJobStatus(jobId, ['UPLOADED']);
        console.log(`   Parsed ${parsedJob.totalRows} rows`);
        console.log(`   Headers: ${parsedJob.fieldMapping?.headers?.join(', ')}`);

        if (requiresManualMapping) {
            console.log('   ⚠️  Requires manual mapping - skipping validation');
            console.log(`\n✅ PASSED: ${description} (manual mapping needed)`);
            return { passed: true, testCase };
        }

        // Step 5: Save mapping
        console.log('5. Saving field mapping...');
        const mapping = getAutoMapping(parsedJob.fieldMapping?.headers || []);
        console.log(`   Mapping: ${JSON.stringify(mapping)}`);
        await apiRequest('POST', `/import-jobs/${jobId}/mapping`, { mapping });

        // Step 6: Trigger validation
        console.log('6. Triggering validation...');
        await apiRequest('POST', `/import-jobs/${jobId}/validate`);

        // Step 7: Wait for validation
        console.log('7. Waiting for validation...');
        const validatedJob = await waitForJobStatus(jobId, ['VALIDATED']);
        console.log(`   Valid: ${validatedJob.validRows}, Invalid: ${validatedJob.invalidRows}, Duplicates: ${validatedJob.duplicateRows}`);

        // Step 8: Verify results
        let passed = true;
        const errors = [];

        if (validatedJob.validRows !== expectedValidRows) {
            errors.push(`Expected ${expectedValidRows} valid rows, got ${validatedJob.validRows}`);
            passed = false;
        }
        if (validatedJob.invalidRows !== expectedInvalidRows) {
            errors.push(`Expected ${expectedInvalidRows} invalid rows, got ${validatedJob.invalidRows}`);
            passed = false;
        }
        if (validatedJob.duplicateRows !== expectedDuplicateRows) {
            errors.push(`Expected ${expectedDuplicateRows} duplicate rows, got ${validatedJob.duplicateRows}`);
            passed = false;
        }

        if (passed) {
            console.log(`\n✅ PASSED: ${description}`);
        } else {
            console.log(`\n❌ FAILED: ${description}`);
            errors.forEach((e) => console.log(`   - ${e}`));
        }

        // Cleanup: Delete the job
        await apiRequest('DELETE', `/import-jobs/${jobId}`);

        return { passed, testCase, errors };
    } catch (error) {
        console.log(`\n❌ ERROR: ${description}`);
        console.log(`   ${error.message}`);
        return { passed: false, testCase, errors: [error.message] };
    }
}

// Main test runner
async function runAllTests() {
    console.log('\n' + '='.repeat(60));
    console.log('CONTACTS IMPORT - AUTOMATED TEST SUITE');
    console.log('='.repeat(60));
    console.log(`API Base: ${API_BASE}`);
    console.log(`Test Data Dir: ${TEST_DATA_DIR}`);
    console.log(`Total Test Cases: ${TEST_CASES.length}`);

    if (!AUTH_TOKEN) {
        console.log('\n⚠️  No AUTH_TOKEN set. Tests may fail without authentication.');
        console.log('   Set AUTH_TOKEN env variable with a valid JWT token.');
        console.log('   Example: AUTH_TOKEN=eyJhbG... node run-import-tests.js\n');
    }

    const results = [];

    for (const testCase of TEST_CASES) {
        results.push(await runTestCase(testCase));
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));

    const passed = results.filter((r) => r.passed).length;
    const failed = results.length - passed;

    console.log(`\nTotal:  ${results.length}`);
    console.log(`Passed: ${passed} ✅`);
    console.log(`Failed: ${failed} ❌`);

    if (failed > 0) {
        console.log('\nFailed Tests:');
        results
            .filter((r) => !r.passed)
            .forEach((r) => {
                console.log(`  - ${r.testCase.description}`);
                r.errors?.forEach((e) => console.log(`    ${e}`));
            });
    }

    process.exit(failed > 0 ? 1 : 0);
}

// Run
runAllTests().catch(console.error);
