// Self-contained browser code: reports require no server or external scripts.
export const transactionExplorerMarkup = `<section aria-labelledby="transactionExplorerTitle">
<h2 id="transactionExplorerTitle" tabindex="-1"><span aria-hidden="true" style="display:inline-block;margin-right:.4em">📋</span>Find a transaction</h2>
<label for="transactionQuery">Transaction index (#1 or 1), signature fragment, or exact account address</label>
<input id="transactionQuery" type="search" placeholder="#0, signature, or account address" autocomplete="off" style="display:block;width:100%;padding:12px;margin:10px 0;background:#07101d;color:inherit;border:1px solid #67a8e8;border-radius:6px">
<label for="transactionOutcome">Transaction status</label>
<select id="transactionOutcome" style="padding:10px;margin:8px;background:#07101d;color:inherit;border:1px solid #67a8e8;border-radius:6px"><option value="any">Any status</option><option value="success">Successful</option><option value="failed">Failed</option><option value="unknown">Unknown</option></select>
<p class="muted">Unknown means the supplied transaction data does not establish an outcome.</p>
<p id="transactionSearchStatus" role="status">Enter a search or choose a status to inspect transactions and their declared conflicts.</p>
<div id="waveInspection"></div><div id="accountInspection"></div><div id="transactionMatches"></div><div id="transactionInspection"></div>
</section>`;

export const transactionExplorerScript = String.raw`
function selectWave(wave,scope,page=0){
 const target=$('waveInspection');target.replaceChildren();target.dataset.scope=scope;$('transactionInspection').replaceChildren();
 const title=document.createElement('h3');title.textContent=scope+' wave '+(wave.wave+1);title.tabIndex=-1;target.appendChild(title);
 const note=document.createElement('p');note.textContent=wave.transactionCount+' transactions · '+waveComputeLabel(wave)+'. This generated grouping describes declared account compatibility, not observed execution order. Wave membership is independent of the search filters.';target.appendChild(note);
 for(const index of wave.transactionIndexes.slice(page*50,(page+1)*50)){
  const tx=a.transactions.find(tx=>tx.index===index),button=document.createElement('button');button.type='button';button.className='wave-transaction';button.textContent='Inspect transaction #'+index+' · '+tx.status+' · '+(tx.computeUnitsConsumed===null?'CU unknown':tx.computeUnitsConsumed+' CU');button.onclick=()=>selectTransaction(tx);target.appendChild(button);
 }
 if(wave.transactionIndexes.length>50)appendExplorerPager(target,page,50,wave.transactionIndexes.length,'wave transactions',next=>selectWave(wave,scope,next));
 title.focus({preventScroll:true});target.scrollIntoView({block:'nearest'});
}
function instructionPositionLabel(ix){return ix.location+' instruction '+ix.instructionIndex+(ix.parentInstructionIndex===null?'':' (parent '+ix.parentInstructionIndex+')')}
function selectUploadSequence(sequence,group,page=0){
 const target=$('uploadSequenceInspection');target.replaceChildren();
 const title=document.createElement('h3');title.textContent='Upload chunks from byte '+sequence.firstOffset;title.tabIndex=-1;target.appendChild(title);
 const note=document.createElement('p');note.textContent=sequence.chunkCount+' decoded payload chunks for buffer '+sequence.buffer+'. Transaction outcomes do not establish final buffer contents.';target.appendChild(note);
 const table=document.createElement('table');table.innerHTML='<thead><tr><th>Transaction</th><th>Instruction</th><th>Status</th><th>First byte</th><th>Last byte</th><th>Bytes</th></tr></thead>';
 const body=document.createElement('tbody');
 for(const chunk of sequence.chunks.slice(page*50,(page+1)*50)){
  const row=document.createElement('tr'),cell=document.createElement('td'),button=document.createElement('button');button.type='button';button.className='upload-transaction';button.textContent='Inspect transaction #'+chunk.transactionIndex;button.onclick=()=>selectTransaction(a.transactions.find(tx=>tx.index===chunk.transactionIndex),0,chunk);cell.appendChild(button);row.appendChild(cell);
  for(const value of [instructionPositionLabel(chunk),chunk.transactionStatus,chunk.offset,chunk.finalCoveredByte,chunk.byteLength]){const cell=document.createElement('td');cell.textContent=String(value);row.appendChild(cell)}
  body.appendChild(row);
 }
 table.appendChild(body);target.appendChild(table);
 if(sequence.chunks.length>50)appendExplorerPager(target,page,50,sequence.chunks.length,'upload chunks',next=>selectUploadSequence(sequence,group,next));
 const raw=document.createElement('details'),label=document.createElement('summary'),pre=document.createElement('pre');label.textContent='Upload sequence JSON evidence';pre.textContent=JSON.stringify({sequence,group:{gaps:group.gaps,overlaps:group.overlaps}},null,2);raw.append(label,pre);target.appendChild(raw);
 title.focus({preventScroll:true});target.scrollIntoView({block:'nearest'});
}
function selectAccount(account){
 const query=$('transactionQuery');query.value=account.account;
 $('transactionInspection').replaceChildren();
 const target=$('accountInspection');target.replaceChildren();
 const title=document.createElement('h3');title.textContent=account.label??'Account';target.appendChild(title);
 const address=document.createElement('p');address.textContent=account.account;target.appendChild(address);
 const access=document.createElement('p');access.textContent=account.readerCount+' readers · '+account.writerCount+' writers · '+account.affectedTransactionCount+' transactions';target.appendChild(access);
 const pairs=document.createElement('p');pairs.textContent=account.uniquePairCoverage+' conflict pairs ('+account.exclusiveEdgeCount+' explained by this account alone; '+account.overlappingEdgeCount+' also explained by other accounts).';target.appendChild(pairs);
 const note=document.createElement('p');note.textContent='Readers and writers describe declared account access, not observed runtime operations.';target.appendChild(note);
 searchTransactions();query.focus();query.scrollIntoView({block:'center'});
}
function renderDeclaredAccounts(target,tx,page=0){
 target.replaceChildren();
 const table=document.createElement('table');table.className='declared-account-table';table.innerHTML='<thead><tr><th>Account</th><th>Declared access</th><th>Signer</th></tr></thead>';
 const body=document.createElement('tbody');
 for(const account of tx.accounts.slice(page*50,(page+1)*50)){
  const row=document.createElement('tr'),cell=document.createElement('td'),button=document.createElement('button');button.type='button';button.className='transaction-account';button.textContent=account.pubkey;button.setAttribute('aria-label','Inspect declared account '+account.pubkey);button.onclick=()=>selectAccount(a.accounts.find(item=>item.account===account.pubkey));cell.appendChild(button);
  if(account.knownLabel){const label=document.createElement('p');label.textContent=account.knownLabel;cell.appendChild(label)}
  row.appendChild(cell);for(const value of [account.writable?'write':'read-only',account.signer?'yes':'no']){const cell=document.createElement('td');cell.textContent=value;row.appendChild(cell)}body.appendChild(row);
 }
 table.appendChild(body);target.appendChild(table);
 if(tx.accounts.length>50)appendExplorerPager(target,page,50,tx.accounts.length,'declared accounts',next=>renderDeclaredAccounts(target,tx,next));
}
function selectTransaction(tx,conflictPage=0,instructionPosition=null){
 const target=$('transactionInspection');target.replaceChildren();
 const title=document.createElement('h3');title.textContent='Transaction #'+tx.index;title.tabIndex=-1;target.appendChild(title);
 const identity=document.createElement('p');identity.textContent=tx.signature??'Signature unavailable';target.appendChild(identity);
 const wave=a.waves.findIndex(indexes=>indexes.includes(tx.index));
 const facts=document.createElement('p');facts.textContent='Status: '+tx.status+' · Compute: '+(tx.computeUnitsConsumed===null?'unknown':tx.computeUnitsConsumed+' CU')+' · Generated wave: '+(wave<0?'unknown':wave+1)+' · '+tx.readSet.length+' read-only accounts · '+tx.writeSet.length+' writable accounts';target.appendChild(facts);
 if(tx.status==='failed'){
  const error=document.createElement('details'),label=document.createElement('summary'),pre=document.createElement('pre');error.id='recordedTransactionError';error.open=true;label.textContent='Recorded transaction error';pre.textContent=tx.executionError===undefined?'Error details unavailable in the supplied data.':JSON.stringify(tx.executionError,null,2);error.append(label,pre);target.appendChild(error);
 }
 if(instructionPosition){
  const instruction=tx.instructions.find(ix=>ix.location===instructionPosition.location&&ix.parentInstructionIndex===instructionPosition.parentInstructionIndex&&ix.instructionIndex===instructionPosition.instructionIndex);
  if(instruction){const details=document.createElement('details'),label=document.createElement('summary'),pre=document.createElement('pre');details.id='selectedUploadInstruction';details.open=true;label.textContent='Selected '+instructionPositionLabel(instruction);pre.textContent=JSON.stringify(instruction,null,2);details.append(label,pre);target.appendChild(details)}
 }
 const accounts=document.createElement('details'),accountTitle=document.createElement('summary'),accountNote=document.createElement('p'),accountList=document.createElement('div');accounts.id='declaredAccounts';accountTitle.textContent='Declared accounts ('+tx.accounts.length+')';accountNote.textContent='Normalized declared access, including accounts without conflicts. These declarations do not prove runtime reads or writes. Select an account to inspect its block-wide usage.';accounts.append(accountTitle,accountNote,accountList);renderDeclaredAccounts(accountList,tx);target.appendChild(accounts);
 const edges=a.conflictEdges.filter(edge=>edge.source===tx.index||edge.target===tx.index);
 const summary=document.createElement('p');summary.textContent=edges.length?edges.length+' declared conflict pairs. These account locks do not establish execution order.':'No declared account conflicts with other transactions in this block.';target.appendChild(summary);
 const start=conflictPage*100;
 for(const edge of edges.slice(start,start+100)){
  const peer=a.transactions.find(item=>item.index===(edge.source===tx.index?edge.target:edge.source));
  const entry=document.createElement('details'),label=document.createElement('summary');
  label.textContent='Transaction #'+peer.index+' · '+edge.accounts.length+' conflicting '+(edge.accounts.length===1?'account':'accounts');entry.appendChild(label);
  const table=document.createElement('table');table.innerHTML='<thead><tr><th>Account</th><th>This transaction</th><th>Transaction #'+peer.index+'</th></tr></thead>';
  const body=document.createElement('tbody');
  for(const address of edge.accounts){const row=document.createElement('tr');for(const text of [address,tx.writeSet.includes(address)?'write':'read',peer.writeSet.includes(address)?'write':'read']){const cell=document.createElement('td');cell.textContent=text;row.appendChild(cell)}body.appendChild(row)}
  table.appendChild(body);entry.appendChild(table);
  const button=document.createElement('button');button.type='button';button.textContent='Inspect transaction #'+peer.index;button.onclick=()=>selectTransaction(peer);entry.appendChild(button);target.appendChild(entry);
 }
 if(edges.length>100)appendExplorerPager(target,conflictPage,100,edges.length,'conflict pairs',page=>selectTransaction(tx,page,instructionPosition));
 const raw=document.createElement('details'),rawTitle=document.createElement('summary'),pre=document.createElement('pre');rawTitle.textContent='Transaction JSON evidence';pre.textContent=JSON.stringify(tx,null,2);raw.append(rawTitle,pre);target.appendChild(raw);
 title.focus({preventScroll:true});target.scrollIntoView({block:'nearest'});
}
function appendExplorerPager(target,page,size,total,label,onPage){
 const nav=document.createElement('nav');nav.setAttribute('aria-label',label+' pages');
 const status=document.createElement('p');status.className='explorer-page-position';status.tabIndex=-1;status.setAttribute('aria-label',label+' page position');status.textContent='Showing '+(page*size+1)+'–'+Math.min((page+1)*size,total)+' of '+total+' '+label;nav.appendChild(status);
 for(const [text,next,disabled] of [['Previous',page-1,page===0],['Next',page+1,(page+1)*size>=total]]){
  const button=document.createElement('button');button.type='button';button.textContent=text+' '+label;button.disabled=disabled;button.onclick=()=>{onPage(next);target.querySelector('.explorer-page-position')?.focus()};nav.appendChild(button);
 }
 target.appendChild(nav);
}
function searchTransactions(page=0){
 const query=$('transactionQuery').value.trim(),outcome=$('transactionOutcome').value,target=$('transactionMatches');target.replaceChildren();
 if(!query&&outcome==='any'){$('transactionSearchStatus').textContent='Enter a search or choose a status to inspect transactions and their declared conflicts.';return}
 const indexQuery=/^#?\d+$/.test(query)?Number(query.replace(/^#/,'')):null;
 const exactAccount=a.accounts.some(account=>account.account===query);
 const matches=a.transactions.filter(tx=>(outcome==='any'||tx.status===outcome)&&(!query||(exactAccount?tx.accounts.some(account=>account.pubkey===query):indexQuery!==null?tx.index===indexQuery:(tx.signature!==null&&tx.signature.includes(query)))));
 $('transactionSearchStatus').textContent=matches.length+' matching '+(matches.length===1?'transaction':'transactions')+(outcome==='any'?'':' with '+outcome+' status')+'.';
 for(const tx of matches.slice(page*50,(page+1)*50)){const button=document.createElement('button');button.type='button';button.className='transaction-match';button.textContent='#'+tx.index+' · '+tx.status+' · '+(tx.signature??'Signature unavailable');button.onclick=()=>selectTransaction(tx);target.appendChild(button)}
 if(matches.length>50)appendExplorerPager(target,page,50,matches.length,'matches',searchTransactions);
}
function updateTransactionSearch(){$('accountInspection').replaceChildren();$('transactionInspection').replaceChildren();searchTransactions()}
$('transactionQuery').addEventListener('input',updateTransactionSearch);
$('transactionOutcome').addEventListener('change',updateTransactionSearch);
`;