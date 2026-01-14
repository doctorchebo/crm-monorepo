const fs = require('fs');

// Generate 50k rows CSV
let content = 'First Name,Last Name,Country Code,Phone,Email\n';
for (let i = 1; i <= 50000; i++) {
    const paddedNum = String(i).padStart(4, '0');
    content += `User${i},Test,+1,415555${paddedNum},user${i}@test.com\n`;
}
fs.writeFileSync('./contact_import/large_dataset_50k_rows.csv', content);
console.log('Generated 50k rows CSV');
