import fs from 'fs';
import path from 'path';

const INPUT_PATH = 'D:\\Users\\User\\Downloads\\員工資料表 (1).txt';
const OUTPUT_DIR = './data';
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'employees.json');

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function parseEmployees() {
    try {
        const content = fs.readFileSync(INPUT_PATH, 'utf8');
        const lines = content.split('\n');
        const employees = [];

        lines.forEach(line => {
            // Regex to match the format [status]; [id]; [password]; [name]; [ip_keys]; [username];
            // Example: [-o-];   [00001];     [Ht@54321];  [沈國榮{總裁}];       [{2.10.21}];             [david-shen];
            const match = line.match(/\[.*?\];\s*\[.*?\];\s*\[.*?\];\s*\[(.*?)\];\s*\[(.*?)\];\s*\[(.*?)\];/);

            if (match) {
                const rawName = match[1].trim();
                const rawIpKeys = match[2].trim();

                // Clean name (remove anything in curly braces if needed, but keeping it for now)
                const name = rawName;

                // Extract IP patterns from curly braces like {2.10.21}
                // Prepend "10." as per user feedback for internal network matching
                // ALSO add "10.x.106.y" variant as requested
                const ipPatterns = [];
                const ipMatches = rawIpKeys.matchAll(/\{(.*?)\}/g);
                for (const m of ipMatches) {
                    const original = "10." + m[1];
                    ipPatterns.push(original);

                    // Create 10.x.106.y variant ONLY for 10.x.8.y subnet
                    const segments = original.split('.');
                    if (segments.length === 4 && segments[2] === '8') {
                        const variant = `${segments[0]}.${segments[1]}.106.${segments[3]}`;
                        ipPatterns.push(variant);
                    }
                }

                if (ipPatterns.length > 0) {
                    employees.push({ name, ipPatterns });
                }
            }
        });

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(employees, null, 2));
        console.log(`Successfully parsed ${employees.length} employees with IP patterns to ${OUTPUT_FILE}`);
    } catch (error) {
        console.error('Parsing error:', error.message);
    }
}

parseEmployees();
