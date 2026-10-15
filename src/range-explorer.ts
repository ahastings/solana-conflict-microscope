// Embedded in the standalone range report; no network or external scripts.
export const rangeExplorerMarkup = `<section id="rangeChunkInspector" hidden><h2 id="rangeChunkTitle" tabindex="-1">Upload chunks across slots</h2><p>Decoded payloads describe recorded instructions, not verified final buffer contents.</p><div id="rangeChunkRows"></div><div id="rangeChunkEvidence"></div></section>`;

export const rangeExplorerScript = String.raw`
// Fragments identify evidence in this saved report: #slot=N or #chunk=sequenceIndex:chunkIndex.
// Chunk indexes are zero-based positions in the exported sequence.chunks array, not byte offsets.
function clearRangeLinkStatus(){const status=document.getElementById('rangeLinkStatus');status.hidden=true;status.textContent=''}
function replaceRangeSelectionLink(fragment){
 clearRangeLinkStatus();
 // Selection still works when a host disallows history changes (including some file viewers).
 try{if(location.hash!==fragment)history.replaceState(null,'',fragment)}catch{}
}
function selectRangeSlot(slot,sequenceIndex){
 selectSlot(slot,sequenceIndex);
 document.getElementById('rangeChunkInspector').hidden=true;
 document.getElementById('rangeChunkEvidence').replaceChildren();
 replaceRangeSelectionLink('#slot='+slot);
}
function showRangeChunk(chunk,sequenceIndex,updateLink=true){
 const chunkIndex=view.sequences[sequenceIndex]?.chunks.indexOf(chunk);if(chunkIndex==null||chunkIndex<0)return;
 selectSlot(chunk.slot,sequenceIndex);
 const target=document.getElementById('rangeChunkEvidence');target.replaceChildren();
 const title=document.createElement('h3');title.tabIndex=-1;title.textContent='Slot '+chunk.slot+', transaction #'+chunk.transactionIndex;target.appendChild(title);
 const linkLine=document.createElement('p'),link=document.createElement('a');link.id='rangeChunkLink';link.href='#chunk='+sequenceIndex+':'+chunkIndex;link.textContent='Link to this exact upload chunk';linkLine.appendChild(link);target.appendChild(linkLine);
 const facts=document.createElement('p');facts.textContent='Status: '+chunk.transactionStatus+' · Compute: '+(chunk.computeUnitsConsumed===null?'unknown':chunk.computeUnitsConsumed+' CU')+' · '+chunk.location+' instruction '+chunk.instructionIndex+(chunk.parentInstructionIndex===null?'':' (parent '+chunk.parentInstructionIndex+')');target.appendChild(facts);
 if(chunk.transactionStatus==='failed'){const error=document.createElement('details'),label=document.createElement('summary'),pre=document.createElement('pre');error.open=true;label.textContent='Recorded transaction error';pre.className='technical';pre.textContent=chunk.executionError===undefined?'Error details unavailable in the supplied data.':JSON.stringify(chunk.executionError,null,2);error.append(label,pre);target.appendChild(error)}
 const signature=document.createElement('p');signature.textContent=chunk.signature??'Signature unavailable';target.appendChild(signature);
 const details=document.createElement('details'),label=document.createElement('summary'),pre=document.createElement('pre');details.open=true;label.textContent='Selected chunk and instruction evidence';pre.className='technical';pre.textContent=JSON.stringify(chunk,null,2);details.append(label,pre);target.appendChild(details);
 if(updateLink)replaceRangeSelectionLink('#chunk='+sequenceIndex+':'+chunkIndex);
 title.focus({preventScroll:true});target.scrollIntoView({block:'nearest'});
}
function showRangeChunks(sequenceIndex,page=0,updateLink=true){
 const sequence=view.sequences[sequenceIndex],panel=document.getElementById('rangeChunkInspector'),target=document.getElementById('rangeChunkRows');panel.hidden=false;target.replaceChildren();document.getElementById('rangeChunkEvidence').replaceChildren();
 const title=document.getElementById('rangeChunkTitle');title.textContent=sequence.chunks.length+' upload chunks across slots';
 const table=document.createElement('table');table.tabIndex=0;table.setAttribute('aria-label','Decoded upload chunks');table.innerHTML='<thead><tr><th>Evidence</th><th>Instruction</th><th>Status</th><th>First byte</th><th>Last byte</th><th>Bytes</th></tr></thead>';
 const body=document.createElement('tbody');
 for(const chunk of sequence.chunks.slice(page*50,(page+1)*50)){
  const row=document.createElement('tr'),cell=document.createElement('td'),button=document.createElement('button');button.className='range-chunk';button.type='button';button.textContent='Slot '+chunk.slot+', transaction #'+chunk.transactionIndex;button.onclick=()=>showRangeChunk(chunk,sequenceIndex);cell.appendChild(button);row.appendChild(cell);
  for(const text of [chunk.location+' '+chunk.instructionIndex+(chunk.parentInstructionIndex===null?'':' (parent '+chunk.parentInstructionIndex+')'),chunk.transactionStatus,chunk.offset,chunk.finalCoveredByte,chunk.byteLength]){const cell=document.createElement('td');cell.textContent=String(text);row.appendChild(cell)}body.appendChild(row);
 }
 table.appendChild(body);target.appendChild(table);
 const nav=document.createElement('nav');nav.setAttribute('aria-label','Range upload chunks pages');
 const status=document.createElement('p');status.id='rangeChunkPage';status.tabIndex=-1;status.textContent='Showing '+(page*50+1)+'–'+Math.min((page+1)*50,sequence.chunks.length)+' of '+sequence.chunks.length+' chunks';nav.appendChild(status);
 if(sequence.chunks.length>50)for(const [text,next,disabled] of [['Previous',page-1,page===0],['Next',page+1,(page+1)*50>=sequence.chunks.length]]){const button=document.createElement('button');button.type='button';button.textContent=text+' range chunks';button.disabled=disabled;button.onclick=()=>{showRangeChunks(sequenceIndex,next);document.getElementById('rangeChunkPage').focus()};nav.appendChild(button)}
 target.appendChild(nav);if(updateLink){const link=document.getElementById('rangeSlotLink');if(!link.hidden)replaceRangeSelectionLink(link.getAttribute('href'))}title.focus({preventScroll:true});panel.scrollIntoView({block:'nearest'});
}
document.querySelectorAll('.inspect-range-chunks').forEach(button=>button.onclick=()=>showRangeChunks(Number(button.dataset.sequence)));
function applyRangeEvidenceLink(){
 const hash=location.hash;if(!/^#(?:slot|chunk)(?:=|$)/.test(hash)){clearRangeLinkStatus();return}
 const validIndex=value=>Number.isSafeInteger(value)&&value>=0;
 const slotMatch=/^#slot=(\d+)$/.exec(hash),chunkMatch=/^#chunk=(\d+):(\d+)$/.exec(hash);
 let message='Invalid evidence link. Use #slot= followed by a nonnegative safe integer, or #chunk= followed by two zero-based indexes separated by a colon. Current selection is unchanged.';
 if(slotMatch&&validIndex(Number(slotMatch[1]))){
  const slot=Number(slotMatch[1]),state=view.slots.find(item=>item.slot===slot);
  if(state){clearRangeLinkStatus();selectSlot(slot,null);document.getElementById('rangeChunkInspector').hidden=true;document.getElementById('rangeChunkEvidence').replaceChildren();const title=document.getElementById('slotWaveTitle');title.focus({preventScroll:true});title.scrollIntoView({block:'nearest'});return}
  message='Slot link unavailable: this slot is outside the saved report. Current selection is unchanged.';
 }else if(chunkMatch&&validIndex(Number(chunkMatch[1]))&&validIndex(Number(chunkMatch[2]))){
  const sequenceIndex=Number(chunkMatch[1]),chunkIndex=Number(chunkMatch[2]),chunk=view.sequences[sequenceIndex]?.chunks[chunkIndex];
  if(chunk){clearRangeLinkStatus();showRangeChunks(sequenceIndex,Math.floor(chunkIndex/50),false);showRangeChunk(chunk,sequenceIndex,false);return}
  message='Chunk link unavailable: this sequence or chunk is outside the saved report. Current selection is unchanged.';
 }
 const status=document.getElementById('rangeLinkStatus');status.textContent=message;status.hidden=false;status.focus({preventScroll:true});status.scrollIntoView({block:'nearest'});
}
// Run after hydration, the default selection, and both inspector functions exist.
addEventListener('hashchange',applyRangeEvidenceLink);
applyRangeEvidenceLink();
`;
