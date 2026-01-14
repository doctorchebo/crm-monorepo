/**
 * Test Data Generator for Contacts Import
 * 
 * Generates XLSX versions of CSV test files and creates automated test suite
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const testDataDir = './contact_import';

// Test cases to generate XLSX versions for
const testCases = [
    'success_basic_contacts',
    'success_email_only_contacts',
    'failure_missing_required_fields',
    'failure_duplicate_rows_inside_file',
    'failure_invalid_email_formats',
    'failure_invalid_phone_formats',
    'missing_country_code_with_default',
    'mixed_valid_and_invalid_contacts',
    'unexpected_headers',
    'empty_and_whitespace_rows',
    'large_dataset_50k_rows'
];

// Function to convert CSV to XLSX
function csvToXlsx(csvPath, xlsxPath) {
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const rows = csvContent.trim().split('\n').map(row => row.split(','));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_array ?
        XLSX.utils.aoa_to_sheet(rows) :
        XLSX.utils.aoa_to_sheet(rows);

    XLSX.utils.book_append_sheet(wb, ws, 'Contacts');
    XLSX.writeFile(wb, xlsxPath);
    console.log(`Created: ${xlsxPath}`);
}

// Generate XLSX versions
console.log('Generating XLSX test files...\n');

testCases.forEach(testCase => {
    const csvPath = path.join(testDataDir, `${testCase}.csv`);
    const xlsxPath = path.join(testDataDir, `${testCase}.xlsx`);

    if (fs.existsSync(csvPath)) {
        try {
            csvToXlsx(csvPath, xlsxPath);
        } catch (err) {
            console.error(`Error converting ${testCase}: ${err.message}`);
        }
    } else {
        console.warn(`Skipping ${testCase}: CSV file not found`);
    }
});

console.log('\nDone! XLSX files generated.');
