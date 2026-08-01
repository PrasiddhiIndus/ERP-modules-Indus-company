import fs from 'fs';

const p = 'src/contexts/Layout.jsx';
let s = fs.readFileSync(p, 'utf8');
s = s.replaceAll('className="text-sm font-medium"', 'className="type-body-medium type-truncate"');
s = s.replaceAll('<span className="text-xs">', '<span className="type-meta type-truncate">');
fs.writeFileSync(p, s);
console.log('Layout nav typography updated');
