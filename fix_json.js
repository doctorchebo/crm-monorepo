// Fix JSON indentation for the settings sections
const fs = require('fs');
const file = 'frontend/messages/en.json';

let content = fs.readFileSync(file, 'utf8');
let lines = content.split(/\r?\n/);

let inMalformedSection = false;
let result = [];

for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Detect start of malformed section (closing knowledgeBase without proper indent)
    if (line === '},') {
        // Check if next line starts without proper indent
        if (i + 1 < lines.length && /^"(settings|settingsAi|settingsChats|connectWhatsapp)"/.test(lines[i + 1])) {
            line = '  },';
            inMalformedSection = true;
        }
    }

    if (inMalformedSection) {
        // Key lines like "settings": {
        if (/^"(settings|settingsAi|settingsChats|connectWhatsapp)"/.test(line)) {
            line = '  ' + line;
        }
        // Content lines with 2 spaces that should have 4
        else if (/^  "[^"]+"/.test(line) && !/^    /.test(line)) {
            line = '  ' + line;
        }
        // Closing braces
        else if (line === '},') {
            line = '  },';
        }
        else if (line === '}') {
            // Keep as is - this is the root closing brace
            inMalformedSection = false;
        }
    }

    result.push(line);
}

fs.writeFileSync(file, result.join('\r\n'), 'utf8');
console.log('Fixed!');
