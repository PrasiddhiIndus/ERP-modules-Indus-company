import fs from 'fs';

function replaceFonts(file) {
  let s = fs.readFileSync(file, 'utf8');
  const orig = s;
  s = s.replace(
    /--display:"Segoe UI",system-ui,-apple-system,BlinkMacSystemFont,sans-serif;/g,
    '--display:var(--font-sans);'
  );
  s = s.replace(
    /--body:"Segoe UI",system-ui,-apple-system,BlinkMacSystemFont,sans-serif;/g,
    '--body:var(--font-sans);'
  );
  s = s.replace(
    /--mono:ui-monospace,"Cascadia Mono","Segoe UI Mono",Consolas,monospace;/g,
    '--mono:var(--font-mono);'
  );
  if (s !== orig) {
    fs.writeFileSync(file, s);
    console.log('updated', file);
  } else {
    console.log('no change', file);
  }
}

replaceFonts('src/pages/finance/SiteLedgerApp.jsx');
replaceFonts('src/pages/finance/components/FinanceDashboardStyles.jsx');
