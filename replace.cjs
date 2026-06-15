const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(/setStatusMessage\(\{text: (.*?), type: "error"\}\)/g, 'toast.error($1)');
code = code.replace(/setStatusMessage\(\{text: `(.*?)`, type: "error"\}\)/g, 'toast.error(`$1`)');
code = code.replace(/setStatusMessage\(\{text: "(.*?)", type: "error"\}\)/g, 'toast.error("$1")');
code = code.replace(/setStatusMessage\(\{ text: (.*?), type: "error" \}\)/g, 'toast.error($1)');
code = code.replace(/setStatusMessage\(\{ text: `(.*?)`, type: "error" \}\)/g, 'toast.error(`$1`)');
code = code.replace(/setStatusMessage\(\{ text: "(.*?)", type: "error" \}\)/g, 'toast.error("$1")');

code = code.replace(/setStatusMessage\(\{text: (.*?), type: "success"\}\)/g, 'toast.success($1)');
code = code.replace(/setStatusMessage\(\{text: `(.*?)`, type: "success"\}\)/g, 'toast.success(`$1`)');
code = code.replace(/setStatusMessage\(\{text: "(.*?)", type: "success"\}\)/g, 'toast.success("$1")');
code = code.replace(/setStatusMessage\(\{ text: (.*?), type: "success" \}\)/g, 'toast.success($1)');
code = code.replace(/setStatusMessage\(\{ text: `(.*?)`, type: "success" \}\)/g, 'toast.success(`$1`)');
code = code.replace(/setStatusMessage\(\{ text: "(.*?)", type: "success" \}\)/g, 'toast.success("$1")');

code = code.replace(/setStatusMessage\(\{text: (.*?), type: "info"\}\)/g, 'toast.info($1)');
code = code.replace(/setStatusMessage\(\{text: `(.*?)`, type: "info"\}\)/g, 'toast.info(`$1`)');
code = code.replace(/setStatusMessage\(\{text: "(.*?)", type: "info"\}\)/g, 'toast.info("$1")');
code = code.replace(/setStatusMessage\(\{ text: (.*?), type: "info" \}\)/g, 'toast.info($1)');
code = code.replace(/setStatusMessage\(\{ text: `(.*?)`, type: "info" \}\)/g, 'toast.info(`$1`)');
code = code.replace(/setStatusMessage\(\{ text: "(.*?)", type: "info" \}\)/g, 'toast.info("$1")');

code = code.replace(/setStatusMessage\(null\);/g, '');
code = code.replace(/setStatusMessage\(null\)/g, '');

code = code.replace(/setStatusMessage\(\{\s*text:\s*"(.*?)",\s*type:\s*"error"\s*\}\)/g, 'toast.error("$1")');

fs.writeFileSync('src/App.tsx', code);
