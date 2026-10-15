# Check browser interactions

The portable data check remains npm run verify:portable. For interface changes, also run npm run check:ui-cases after it. The latter checks report controls, transaction links, range evidence links, and local file comparison at desktop and phone widths.

npm ci installs a pinned playwright-core development driver without downloading browser binaries. Point it to a separately installed Chrome. For example, in PowerShell:

~~~powershell
$env:MICROSCOPE_CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
npm run verify:portable
npm run check:ui-cases
~~~

On Linux, set MICROSCOPE_CHROME_PATH to your Chrome executable before running the same commands. The GitHub Pages workflow discovers the runner's installed Chrome and runs both verification commands before adding hosted analytics and deploying.

Use MICROSCOPE_PLAYWRIGHT_PATH only to override the browser driver module. The default is the installed playwright-core package. Generated reports have no runtime dependency on that driver and still work offline.

The checks retain logs, downloaded evidence, and browser screenshots under output/. They use saved public or synthetic inputs. No Solana transactions are submitted. File comparison also checks original hashes, unknown compute, invalid inputs, cancellation, resource budgets, and blocked networking. A test failure stops deployment.
