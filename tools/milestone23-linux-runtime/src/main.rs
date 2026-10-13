use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use mollusk_svm::Mollusk;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use solana_account::Account;
use solana_instruction::{AccountMeta, Instruction};
use solana_pubkey::Pubkey;
use solana_svm_log_collector::LogCollector;
use std::{env, fs, path::PathBuf, str::FromStr};

const PROGRAM_ID: &str = "vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P";
const EXPECTED_ELF_SHA256: &str =
    "89d757b837724ab552d1ebf719245e33f9f93b722cb4331b5eec55202d94ca5c";

fn sha256(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

fn changed_ranges(before: &[u8], after: &[u8]) -> Vec<Value> {
    let mut ranges = Vec::new();
    let mut index = 0;
    while index < before.len().max(after.len()) {
        if before.get(index) == after.get(index) {
            index += 1;
            continue;
        }
        let start = index;
        while index < before.len().max(after.len()) && before.get(index) != after.get(index) {
            index += 1;
        }
        ranges.push(json!({
            "start": start,
            "endExclusive": index,
            "beforeHex": hex::encode(before.get(start..index.min(before.len())).unwrap_or_default()),
            "afterHex": hex::encode(after.get(start..index.min(after.len())).unwrap_or_default())
        }));
    }
    ranges
}

fn execute(elf: &[u8], program_id: &Pubkey, instructions: &[Instruction], accounts: &[(Pubkey, Account)]) -> Value {
    let mut mollusk = Mollusk::default();
    mollusk.logger = Some(LogCollector::new_ref_with_limit(None));
    mollusk.program_cache.add_program(
        program_id,
        &solana_sdk_ids::bpf_loader_upgradeable::id(),
        elf,
    );
    let result = mollusk.process_transaction_instructions(instructions, accounts);
    let logs = mollusk.logger.as_ref().unwrap().borrow().messages.clone();
    let outputs: Vec<Value> = result
        .resulting_accounts
        .iter()
        .map(|(key, account)| {
            let before = accounts.iter().find(|(input_key, _)| input_key == key).unwrap().1.clone();
            json!({
                "address": key.to_string(),
                "before": {
                    "lamports": before.lamports.to_string(), "owner": before.owner.to_string(),
                    "executable": before.executable, "dataLength": before.data.len(), "dataSha256": sha256(&before.data)
                },
                "after": {
                    "lamports": account.lamports.to_string(), "owner": account.owner.to_string(),
                    "executable": account.executable, "dataLength": account.data.len(), "dataSha256": sha256(&account.data)
                },
                "lamportDelta": i128::from(account.lamports) - i128::from(before.lamports),
                "ownerChanged": account.owner != before.owner,
                "executableChanged": account.executable != before.executable,
                "dataLengthDelta": account.data.len() as i64 - before.data.len() as i64,
                "dataChangedRanges": changed_ranges(&before.data, &account.data)
            })
        })
        .collect();
    json!({
        "programResult": format!("{:?}", result.program_result),
        "rawResult": format!("{:?}", result.raw_result),
        "computeUnitsConsumed": result.compute_units_consumed,
        "logs": logs,
        "outputs": outputs
    })
}

fn main() {
    let root = PathBuf::from(env::var("M23_REPO_ROOT").expect("M23_REPO_ROOT is required"));
    let plan: Value = serde_json::from_slice(
        &fs::read(root.join("research-plans/velocity-equality-replay-milestone-2.3.json"))
            .expect("read plan"),
    )
    .expect("parse plan");
    let snapshot: Value = serde_json::from_slice(
        &fs::read(root.join("cache/research/candidate-043c938568ad5e15/account-snapshots.raw.json"))
            .expect("read snapshot"),
    )
    .expect("parse snapshot");
    let elf = fs::read(root.join("cache/research/velocity-equality-replay/velocity-deployed.so"))
        .expect("read exact ELF");
    assert_eq!(sha256(&elf), EXPECTED_ELF_SHA256, "exact ELF hash changed");

    let program_id = Pubkey::from_str(PROGRAM_ID).unwrap();
    let frozen_instructions = plan["instructionFixture"]["instructions"].as_array().unwrap();
    let instructions: Vec<Instruction> = frozen_instructions[..4]
        .iter()
        .map(|raw| Instruction {
            program_id: Pubkey::from_str(raw["programId"].as_str().unwrap()).unwrap(),
            accounts: raw["accounts"]
                .as_array()
                .map(|metas| {
                    metas
                        .iter()
                        .map(|meta| {
                            let key = Pubkey::from_str(meta["address"].as_str().unwrap()).unwrap();
                            if meta["writable"].as_bool().unwrap() {
                                AccountMeta::new(key, meta["signer"].as_bool().unwrap())
                            } else {
                                AccountMeta::new_readonly(key, meta["signer"].as_bool().unwrap())
                            }
                        })
                        .collect()
                })
                .unwrap_or_default(),
            data: hex::decode(raw["dataHex"].as_str().unwrap()).unwrap(),
        })
        .collect();
    let post = &frozen_instructions[3];

    let addresses = snapshot["addresses"].as_array().unwrap();
    let values = snapshot["response"]["result"]["value"].as_array().unwrap();
    let mut accounts = Vec::new();
    for meta in post["accounts"].as_array().unwrap() {
        let address = meta["address"].as_str().unwrap();
        if address == "Sysvar1nstructions1111111111111111111111111" {
            accounts.push((
                Pubkey::from_str(address).unwrap(),
                Account {
                    lamports: 0,
                    data: hex::decode(plan["instructionFixture"]["instructionsSysvarRawHex"].as_str().unwrap()).unwrap(),
                    owner: Pubkey::from_str("Sysvar1111111111111111111111111111111111111").unwrap(),
                    executable: false,
                    rent_epoch: 0,
                },
            ));
            continue;
        }
        let index = addresses.iter().position(|item| item.as_str() == Some(address)).unwrap();
        let raw = &values[index];
        accounts.push((
            Pubkey::from_str(address).unwrap(),
            Account {
                lamports: raw["lamports"].as_u64().unwrap(),
                data: BASE64.decode(raw["data"][0].as_str().unwrap()).unwrap(),
                owner: Pubkey::from_str(raw["owner"].as_str().unwrap()).unwrap(),
                executable: raw["executable"].as_bool().unwrap(),
                rent_epoch: raw["rentEpoch"].as_str().unwrap().parse().unwrap(),
            },
        ));
    }

    let baseline = execute(&elf, &program_id, &instructions, &accounts);
    let frozen_cases: Value = serde_json::from_slice(
        &fs::read(root.join("output/research/velocity-equality-replay/branch-replay-results.json"))
            .expect("read frozen cases"),
    )
    .expect("parse frozen cases");
    let cases: Vec<Value> = frozen_cases["cases"].as_array().unwrap().iter().map(|case| {
        let mut inputs = accounts.clone();
        for mutation in case["mutations"].as_array().unwrap() {
            let address = Pubkey::from_str(mutation["address"].as_str().unwrap()).unwrap();
            let account = &mut inputs.iter_mut().find(|(key, _)| key == &address).unwrap().1;
            let value: u64 = mutation["newValue"].as_str().unwrap().parse().unwrap();
            account.data[16..24].copy_from_slice(&value.to_le_bytes());
            assert_eq!(sha256(&account.data), mutation["afterInputSha256"].as_str().unwrap());
        }
        let execution = execute(&elf, &program_id, &instructions, &inputs);
        json!({
            "caseId": case["caseId"], "scope": case["scope"], "testMode": case["testMode"],
            "targetRelation": case["targetRelation"], "nextTimestamp": case["nextTimestamp"],
            "targetCurrentTimestamp": case["targetCurrentTimestamp"], "mutations": case["mutations"],
            "execution": execution
        })
    }).collect();
    let evidence = serde_json::to_string_pretty(&json!({
        "schemaVersion": "2.3-linux-exact-replay",
        "runtime": {
            "name": "mollusk-svm",
            "version": "0.13.1",
            "loader": "BPFLoaderUpgradeable",
            "exactElfSha256": sha256(&elf)
        },
        "baseline": baseline,
        "cases": cases
    })).unwrap() + "\n";
    if let Ok(path) = env::var("M23_EVIDENCE_OUTPUT") {
        fs::write(path, &evidence).expect("write exact replay evidence");
    } else {
        print!("{evidence}");
    }
}
