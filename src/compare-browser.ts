import { readFile } from "node:fs/promises";
import ts from "typescript";

/** Bundle only the three pure local modules; no runtime imports, network or Node APIs enter the browser. */
async function comparisonRuntime(): Promise<string> {
  const names = ["verify-analysis", "compare-analyses", "json-text"];
  const modules = await Promise.all(names.map(async name => {
    const source = await readFile(new URL("./" + name + ".ts", import.meta.url), "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    return JSON.stringify("./" + name + ".js") + ": function(module, exports, require) {\n" + compiled + "\n}";
  }));
  return "const modules={" + modules.join(",") + "};const cache={};function require(name){if(!modules[name])throw Error('Unsupported local module');if(!cache[name]){const module={exports:{}};cache[name]=module;modules[name](module,module.exports,require)}return cache[name].exports;}";
}

export async function localComparisonHtml(): Promise<string> {
  const worker = await comparisonRuntime() + `
const { compareAnalyses, comparisonHtml } = require('./compare-analyses.js');
const { parseJsonFileText } = require('./json-text.js');
onmessage = async event => {
  try {
    const parse = (file, side) => {
      let value;
      try { value = parseJsonFileText(new TextDecoder('utf-8', {fatal:true,ignoreBOM:true}).decode(file.bytes)); }
      catch { throw Error(side + ' file: cannot read valid UTF-8 JSON. Select a saved block analysis.json.'); }
      if (!value || !Array.isArray(value.transactions)) throw Error(side + ' file: select a saved block analysis.json, not a raw RPC response or range analysis.');
      if (value.transactions.length > 5000) throw Error(side + ' file: browser limit is 5,000 transactions. Use compare:analyses for larger blocks.');
      let accounts = 0;
      for (const tx of value.transactions) {
        if (Array.isArray(tx?.accounts)) {
          accounts += tx.accounts.length;
          if (tx.accounts.length > 1024 || accounts > 100000) throw Error(side + ' file: browser account limit exceeded. Use compare:analyses.');
        }
      }
      return value;
    };
    const { left, right } = event.data;
    const comparison = compareAnalyses(parse(left, 'Left'), parse(right, 'Right'));
    const identity = async file => ({name:file.name,sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',file.bytes))).map(byte=>byte.toString(16).padStart(2,'0')).join('')});
    comparison.files = {left:await identity(left),right:await identity(right)};
    postMessage({json:JSON.stringify(comparison,null,2)+'\\n',html:comparisonHtml(comparison)});
  } catch (error) { postMessage({error:error instanceof Error ? error.message.slice(0,400) : 'Comparison failed.'}); }
};`;
  // Keep closing script tags in bundled source inert inside this outer HTML document.
  const workerLiteral = JSON.stringify(worker).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; worker-src blob:; frame-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Compare your saved analyses — Solana Conflict Microscope</title><style>
:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#07101d;color:#e7edf7;line-height:1.5}*{box-sizing:border-box;min-width:0}body{max-width:1200px;margin:auto;padding:24px;overflow-wrap:anywhere}h1{line-height:1.2}a{color:#8ed8ff}a,button{min-height:44px}button,a.download{display:inline-flex;align-items:center;padding:10px 16px;border:1px solid #42658e;border-radius:8px;background:#122b40;color:#8ed8ff;font:inherit;font-weight:650}button:disabled{opacity:.5;cursor:default}button{cursor:pointer}.files{display:grid;grid-template-columns:1fr 1fr;gap:16px}label{display:block;background:#101c2e;border:1px solid #385270;padding:18px;border-radius:10px;font-weight:700}input{display:block;max-width:100%;margin-top:12px;font:inherit}input::file-selector-button{min-height:44px;margin-right:8px}.actions{display:flex;flex-wrap:wrap;gap:12px;margin:18px 0}#comparisonStatus{min-height:1.5em}iframe{width:100%;height:1400px;border:1px solid #385270;border-radius:10px;background:#07101d}:focus-visible{outline:3px solid #ffcc4d;outline-offset:3px}[hidden]{display:none!important}@media(max-width:640px){body{padding:12px}.files{grid-template-columns:1fr}iframe{height:1200px}}
</style></head><body><nav aria-label="Demo navigation"><a href="../index.html#comparison"><span aria-hidden="true">🏠</span> Back to demo</a></nav><h1><span aria-hidden="true">⚖️</span> Compare your saved analyses</h1><p>Select two block <code>analysis.json</code> files exported by the microscope. Files are read in your browser and are never uploaded. No RPC connection or wallet is needed.</p><p>Need examples? Save the <a href="../real-loader/analysis.json" download="loader-analysis.json">upload analysis</a> and <a href="../real-funding/analysis.json" download="funding-analysis.json">funding analysis</a>, then select them below. You can also export a block from a report using Download analysis JSON.</p><p>Browser limits: 16 MiB per file, 5,000 transactions, 1,024 accounts per transaction and 100,000 account entries per block. Verification stops after 15 seconds. For larger inputs, use the terminal's <code>compare:analyses</code> command.</p><div class="files"><label for="leftFile">Left block analysis<input type="file" id="leftFile" accept=".json,application/json"></label><label for="rightFile">Right block analysis<input type="file" id="rightFile" accept=".json,application/json"></label></div><div class="actions"><button id="compareFiles" type="button" disabled>Compare files</button><button id="cancelCompare" type="button" hidden>Cancel comparison</button></div><p id="comparisonStatus" role="status" aria-live="polite">Choose a left and right analysis to begin.</p><section id="resultArea" hidden aria-label="Verified comparison"><h2>Verified comparison</h2><p>Differences describe the supplied observations; they do not demonstrate performance gains or authenticate the source data.</p><div class="actions"><a class="download" id="downloadComparisonJson" download="comparison.json">Download comparison JSON</a><a class="download" id="downloadComparisonHtml" download="comparison.html">Download comparison HTML</a></div><iframe id="resultFrame" title="Verified block evidence comparison" sandbox=""></iframe></section><noscript>JavaScript is required to verify selected files. The bundled example reports remain available from the demo.</noscript><script>
const workerSource=${workerLiteral};
const left=document.getElementById('leftFile'),right=document.getElementById('rightFile'),button=document.getElementById('compareFiles'),cancel=document.getElementById('cancelCompare'),status=document.getElementById('comparisonStatus'),area=document.getElementById('resultArea'),frame=document.getElementById('resultFrame'),jsonLink=document.getElementById('downloadComparisonJson'),htmlLink=document.getElementById('downloadComparisonHtml');
let generation=0,activeWorker=null,timer=null,urls=[];
function clearResult(){area.hidden=true;frame.removeAttribute('srcdoc');for(const url of urls)URL.revokeObjectURL(url);urls=[];jsonLink.removeAttribute('href');htmlLink.removeAttribute('href');}
function stop(){generation++;if(activeWorker)activeWorker.terminate();activeWorker=null;if(timer)clearTimeout(timer);timer=null;button.disabled=!(left.files.length&&right.files.length);cancel.hidden=true;}
function selectionChanged(){stop();clearResult();status.textContent=left.files.length&&right.files.length?'Ready to verify both files.':'Choose a left and right analysis to begin.';}
left.addEventListener('change',selectionChanged);right.addEventListener('change',selectionChanged);
cancel.addEventListener('click',()=>{stop();clearResult();status.textContent='Comparison cancelled. No result was kept.';});
button.addEventListener('click',async()=>{
  stop();clearResult();const current=generation;
  const a=left.files[0],b=right.files[0];if(!a||!b)return;
  if(a.size>16*1024*1024||b.size>16*1024*1024){status.textContent='Browser limit is 16 MiB per file. Use the terminal compare:analyses command for larger inputs.';return;}
  button.disabled=true;cancel.hidden=false;status.textContent='Reading and verifying both files…';
  const fail=message=>{if(current!==generation)return;stop();clearResult();status.textContent=message;};
  try{
    const [leftBytes,rightBytes]=await Promise.all([a.arrayBuffer(),b.arrayBuffer()]);if(current!==generation)return;
    const workerUrl=URL.createObjectURL(new Blob([workerSource],{type:'text/javascript'}));
    try{activeWorker=new Worker(workerUrl);}finally{URL.revokeObjectURL(workerUrl);}
    activeWorker.onerror=event=>{event.preventDefault();fail('Browser verification could not run. Try a current browser or use compare:analyses.');};
    activeWorker.onmessage=event=>{
      if(current!==generation)return;
      const result=event.data;if(result.error){fail(result.error);return;}
      stop();
      const jsonUrl=URL.createObjectURL(new Blob([result.json],{type:'application/json'})),htmlUrl=URL.createObjectURL(new Blob([result.html],{type:'text/html'}));urls=[jsonUrl,htmlUrl];jsonLink.href=jsonUrl;htmlLink.href=htmlUrl;frame.srcdoc=result.html;area.hidden=false;status.textContent='Both saved analyses verified. Comparison ready.';
    };
    timer=setTimeout(()=>fail('Browser verification exceeded 15 seconds. Use compare:analyses for this input.'),15000);
    activeWorker.postMessage({left:{name:a.name,bytes:leftBytes},right:{name:b.name,bytes:rightBytes}},[leftBytes,rightBytes]);
  }catch{fail('The selected files could not be read. Select them again or use compare:analyses.');}
});
window.addEventListener('pagehide',()=>{stop();clearResult();});
</script></body></html>`;
}
