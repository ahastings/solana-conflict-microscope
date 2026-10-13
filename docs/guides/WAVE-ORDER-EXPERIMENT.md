# Deterministic wave-order experiment

Analyzed source: 3284fe9. This experiment did not change production grouping.

A saturation-degree ordering chooses the unassigned transaction adjacent to the most distinct assigned wave colors, breaking ties by graph degree and then transaction index. It assigns the first compatible wave. This is a graph coloring heuristic, not a validator schedule or proof of the minimum.

Across all 1,100 labeled simple graphs with zero through five transactions, the candidate used one fewer wave in 93 cases and the same count in 1,007. It used more in none of this finite corpus; that is not a guarantee on other graphs. Every candidate was checked for complete transaction coverage, no conflict within a wave, and deterministic repeated output.

A six-node crown graph in alternating vertex order has a three-wave first-fit grouping and a valid two-wave candidate. Since it has at least one edge and the candidate uses two waves, its declared-lock minimum is two. The three demo fixtures retained counts 15, 17, and 3. The saved 936-transaction mainnet capture retained 28 waves. Same wave counts do not imply identical membership.

## Integration requirements

Retain the existing first-fit witness unless a checked alternative uses strictly fewer waves. Apply the same rule to declared and counterfactual graph groupings. Keep a deterministic work limit so a difficult or large graph can fall back to its existing valid grouping. Preserve missing evidence and account-role constraints. Verify the exhaustive oracle, existing research fixtures, browser behavior, and reproducibility after integration. No elapsed-time or network-throughput claim follows from fewer graph waves.

## Reproduction

The local script and JSON results are preserved in CHECKPOINTS/2026-09-24-wave-order-experiment/. Copy the TypeScript script under output/ in this source tree and run it with tsx. It reads the bundled demo fixtures and the original saved mainnet analysis at output/mainnet-compatibility-probe/report/analysis.json. No network calls are made. The script is a research prototype; it has no production work cap.

Release and licensing remain deferred.

## Production integration

The analyzer now retains first-fit as a fallback and tries saturation-degree coloring for both declared and counterfactual graphs. Ties preserve the original grouping. The candidate must cover all nodes and pass a final edge check before replacing the baseline. Work is bounded to 200,000 counted edge/vertex/color operations, with guards at 1,024 vertices and 100,000 edges. Exhaustion retains the original witness. This limits the additional optimization work, not the entire analysis.

The integration corrected an older synthetic four-node path test whose first-fit ordering overstated the baseline as three waves. Its exact two-wave baseline means neither individual cause removal reduces depth; jointly removing both leaves one wave. A separate three-node triangle control proves that each individual cause can reduce depth from three to two while a third cause remains.

Verification includes the exhaustive 1,100-graph oracle, crown improvement, deterministic fallback/tie tests, all 360 development tests, and 22 offline browser cases. The saved mainnet capture retains all analysis fields except the updated grouping-description sentence. The three-profile full-analysis benchmark completed; no comparative speed claim is made. Local evidence: output/wave-order-integration-tests.log, output/report-browser-SSdqBP/results.json, output/wave-order-mainnet-check.json, and output/wave-order-benchmark.log.

## Counterfactual witness reuse

A follow-up deterministic sample found a 24-transaction case where independent heuristic runs returned model depths 5, 6, 5, 6: removing payer conflicts appeared to increase the upper bound. The existing five-wave declared grouping remained valid for all models. Counterfactual output now checks reusable witnesses from the computed models and retains any strictly shorter valid witness. The declared model remains the common baseline; each reused witness must cover every transaction exactly once and satisfy all retained edges. Component-exclusion comparisons can similarly project the original grouping onto the remaining transactions.

The frozen counterexample now returns 5, 5, 5, 5. Tests reject witnesses with missing, duplicate, foreign, or conflicting transactions. All 362 development tests passed, followed by 59 targeted tests after explicitly retaining the declared baseline. A 4,000-sample run of 24-transaction graphs found no worsening after conflict removal. These are upper bounds, not proofs that the heuristic finds the minimum. Local evidence: output/wave-witness-reuse-tests.log, output/wave-witness-final-tests.log, output/wave-monotonicity-counterexample.json, and output/wave-witness-sample-results.json.
