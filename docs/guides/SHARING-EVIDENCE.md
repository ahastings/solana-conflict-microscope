# Share a specific piece of report evidence

Open the same saved or hosted report when using an evidence link. Transaction and chunk positions belong to that report; a link does not authenticate the input or refer to a validator execution schedule.

## Single-block transactions

Select a transaction, then use **Link to transaction #N** in its inspector. You can bookmark it, open it, or copy the link with the browser's normal link menu. The fragment is #tx=N, for example:

https://ahastings.github.io/solana-conflict-microscope/real-loader/report.html#tx=11

Transaction indexes are zero-based, matching the report. A missing index or malformed link produces an explanation rather than selecting a different transaction. Normal section links continue to work. Ordinary inspection replaces the current fragment without adding a Back-history entry for every click.

## Range slots and upload chunks

Use **Link to slot N evidence** in the selected slot inspector:

https://ahastings.github.io/solana-conflict-microscope/multi-block-upload/range-report.html#slot=488638500

A stored missing or unavailable observation remains visibly missing or unavailable. It is not converted to an empty successful block.

Select an upload chunk and use **Link to this exact upload chunk**. The fragment is #chunk=S:C: S is the zero-based sequence index, and C is the zero-based chunk position within that sequence. This example selects its first chunk:

https://ahastings.github.io/solana-conflict-microscope/multi-block-upload/range-report.html#chunk=0:0

The correct chunk page and exact instruction evidence reopen on reload. This identifies a position in this saved analysis; it is not a permanent cross-report identifier or a byte offset. To share reproducible evidence, retain the analysis JSON and its provenance/hash alongside the link.

## Sharing local reports

Fragments also work with local HTML files. A file URL points to your own computer: someone else needs the report file and the fragment, or a hosted copy at the corresponding URL. Exported comparison HTML and JSON remain available from the local file-comparison tool. Only select data you are permitted to inspect; local comparison does not upload selected files.

For a broken workflow, use the repository's **Bug report** form. For disputed results or unclear wording, use **Evidence or explanation question** and include the relevant public link and a small witness or counterexample when available.
