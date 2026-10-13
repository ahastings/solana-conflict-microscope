use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use mollusk_svm::{InvocationInspectCallback, Mollusk};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use solana_account::{Account, ReadableAccount};
use solana_instruction::{AccountMeta, Instruction};
use solana_program_runtime::invoke_context::InvokeContext;
use solana_pubkey::Pubkey;
use solana_svm_log_collector::LogCollector;
use solana_transaction_context::instruction_accounts::InstructionAccount;
use std::{
    cell::RefCell,
    collections::{BTreeMap, HashSet},
    env, fs,
    io::Write,
    path::PathBuf,
    rc::Rc,
    str::FromStr,
};

const ELF_HASH: &str = "7fd13697bfc5bbd1dfd85648c28d80ebe8591052ecba7d8b2e00266a95f7a7cb";
fn hash(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}
fn account_json(key: &Pubkey, account: &impl ReadableAccount) -> Value {
    json!({"address":key.to_string(), "owner":account.owner().to_string(),
        "lamports":account.lamports().to_string(), "executable":account.executable(),
        "rentEpoch":account.rent_epoch().to_string(), "dataBase64":BASE64.encode(account.data()),
        "dataLength":account.data().len(), "dataSha256":hash(account.data())})
}
fn inputs(raw: &Value) -> Vec<(Pubkey, Account)> {
    let mut seen = HashSet::new();
    raw.as_array()
        .unwrap()
        .iter()
        .map(|a| {
            let key = Pubkey::from_str(a["address"].as_str().unwrap()).unwrap();
            assert!(seen.insert(key), "duplicate account");
            let data = BASE64.decode(a["dataBase64"].as_str().unwrap()).unwrap();
            assert_eq!(hash(&data), a["dataSha256"].as_str().unwrap());
            (
                key,
                Account {
                    lamports: a["lamports"].as_str().unwrap().parse().unwrap(),
                    data,
                    owner: Pubkey::from_str(a["owner"].as_str().unwrap()).unwrap(),
                    executable: a["executable"].as_bool().unwrap(),
                    rent_epoch: a["rentEpoch"].as_str().unwrap().parse().unwrap(),
                },
            )
        })
        .collect()
}
fn instructions(raw: &Value, count: usize) -> Vec<Instruction> {
    raw.as_array().unwrap()[..count]
        .iter()
        .map(|ix| Instruction {
            program_id: Pubkey::from_str(ix["programId"].as_str().unwrap()).unwrap(),
            data: hex::decode(ix["dataHex"].as_str().unwrap()).unwrap(),
            accounts: ix["accounts"]
                .as_array()
                .unwrap()
                .iter()
                .map(|a| AccountMeta {
                    pubkey: Pubkey::from_str(a["address"].as_str().unwrap()).unwrap(),
                    is_signer: a["signer"].as_bool().unwrap(),
                    is_writable: a["writable"].as_bool().unwrap(),
                })
                .collect(),
        })
        .collect()
}

#[derive(Debug, PartialEq, Eq)]
struct CapturedClock {
    slot: u64,
    epoch_start_timestamp: i64,
    epoch: u64,
    leader_schedule_epoch: u64,
    unix_timestamp: i64,
}
fn validated_clock(raw: &Value) -> CapturedClock {
    let bytes = BASE64
        .decode(raw["dataBase64"].as_str().expect("Clock bytes"))
        .unwrap();
    assert_eq!(bytes.len(), 40, "Clock must contain all 40 bytes");
    assert_eq!(
        hash(&bytes),
        raw["dataSha256"].as_str().expect("Clock hash"),
        "Clock hash mismatch"
    );
    let clock = CapturedClock {
        slot: u64::from_le_bytes(bytes[0..8].try_into().unwrap()),
        epoch_start_timestamp: i64::from_le_bytes(bytes[8..16].try_into().unwrap()),
        epoch: u64::from_le_bytes(bytes[16..24].try_into().unwrap()),
        leader_schedule_epoch: u64::from_le_bytes(bytes[24..32].try_into().unwrap()),
        unix_timestamp: i64::from_le_bytes(bytes[32..40].try_into().unwrap()),
    };
    assert_eq!(
        Some(clock.slot),
        raw["slot"].as_u64(),
        "Clock slot mismatch"
    );
    assert_eq!(
        Some(clock.epoch_start_timestamp),
        raw["epochStartTimestamp"].as_i64(),
        "Clock epoch start mismatch"
    );
    assert_eq!(
        Some(clock.epoch),
        raw["epoch"].as_u64(),
        "Clock epoch mismatch"
    );
    assert_eq!(
        Some(clock.leader_schedule_epoch),
        raw["leaderScheduleEpoch"].as_u64(),
        "Clock leader schedule epoch mismatch"
    );
    assert_eq!(
        Some(clock.unix_timestamp),
        raw["unixTimestamp"].as_i64(),
        "Clock Unix timestamp mismatch"
    );
    clock
}
fn canonical_state(accounts: &[(Pubkey, Account)]) -> BTreeMap<String, Value> {
    accounts
        .iter()
        .map(|(key, account)| (key.to_string(), account_json(key, account)))
        .collect()
}
fn validate_fixture(fixture: &Value) {
    let definitions = fixture["transactions"].as_array().expect("transactions");
    assert_eq!(
        definitions.len(),
        3,
        "exactly three role definitions required"
    );
    let expected_ids = HashSet::from(["anchor-A", "anchor-B", "anchor-C"]);
    let mut ids = HashSet::new();
    let mut required = HashSet::new();
    let program = Pubkey::from_str(fixture["programId"].as_str().unwrap()).unwrap();
    let compute = Pubkey::from_str("ComputeBudget111111111111111111111111111111").unwrap();
    let ed25519 = Pubkey::from_str("Ed25519SigVerify111111111111111111111111111").unwrap();
    let sysvar = solana_sdk_ids::sysvar::instructions::id();
    for definition in definitions {
        let id = definition["id"].as_str().expect("role id");
        assert!(ids.insert(id), "duplicate role definition");
        assert_eq!(
            definition["instructions"].as_array().unwrap().len(),
            5,
            "complete five-instruction role required"
        );
        let ix = instructions(&definition["instructions"], 5);
        assert_eq!(ix[0].program_id, compute, "compute limit program changed");
        assert_eq!(ix[0].data.len(), 5, "compute limit data length changed");
        assert_eq!(ix[0].data[0], 2, "compute limit selector changed");
        assert_eq!(
            u32::from_le_bytes(ix[0].data[1..5].try_into().unwrap()),
            200_000,
            "unsupported compute unit limit"
        );
        assert_eq!(ix[1].program_id, compute, "compute price program changed");
        assert_eq!(ix[1].data.len(), 9, "compute price data length changed");
        assert_eq!(ix[1].data[0], 3, "compute price selector changed");
        assert_eq!(ix[2].program_id, ed25519, "Ed25519 program changed");
        assert_eq!(ix[3].program_id, program, "Post program changed");
        assert_eq!(ix[4].program_id, program, "TWAP program changed");
        assert!(
            ix[3]
                .data
                .starts_with(&hex::decode("daedaaf5278fa621").unwrap()),
            "Post selector changed"
        );
        assert!(
            ix[4].data == hex::decode("f717ff41d45addc2").unwrap(),
            "TWAP selector changed"
        );
        for instruction in ix {
            for meta in instruction.accounts {
                if meta.pubkey != sysvar {
                    required.insert(meta.pubkey);
                }
            }
        }
    }
    assert_eq!(ids, expected_ids, "role identity changed");
    let scenarios = fixture["scenarios"].as_array().expect("scenarios");
    assert_eq!(scenarios.len(), 2, "exactly ABC and ACB scenarios required");
    let mut scenario_ids = HashSet::new();
    let expected_orders = [
        json!(["anchor-A", "anchor-B", "anchor-C"]),
        json!(["anchor-A", "anchor-C", "anchor-B"]),
    ];
    let reference_state = canonical_state(&inputs(&scenarios[0]["accounts"]));
    let reference_clock = validated_clock(&scenarios[0]["clock"]);
    for (index, scenario) in scenarios.iter().enumerate() {
        assert!(
            scenario_ids.insert(scenario["id"].as_str().expect("scenario id")),
            "duplicate scenario id"
        );
        assert_eq!(
            scenario["order"], expected_orders[index],
            "scenario order changed"
        );
        assert_eq!(
            scenario["instructionCount"].as_u64(),
            Some(5),
            "Post-only scenarios forbidden"
        );
        assert!(
            scenario["mutations"]
                .as_array()
                .expect("explicit mutations array")
                .is_empty(),
            "mutations forbidden in current capture experiment"
        );
        assert_eq!(
            validated_clock(&scenario["clock"]),
            reference_clock,
            "scenario Clock changed"
        );
        let accounts = inputs(&scenario["accounts"]);
        assert!(
            !accounts
                .iter()
                .any(|(key, _)| *key == sysvar || *key == solana_sdk_ids::sysvar::clock::id()),
            "runtime sysvars must not be ordinary fixture accounts"
        );
        assert_eq!(
            canonical_state(&accounts),
            reference_state,
            "ordinary account state changed between scenarios"
        );
        let available: HashSet<Pubkey> = accounts.iter().map(|(key, _)| *key).collect();
        assert!(
            required.is_subset(&available),
            "missing ordinary instruction account"
        );
    }
}

struct Observer {
    events: Rc<RefCell<Vec<Value>>>,
}
impl Observer {
    fn capture(&self, phase: &str, context: &InvokeContext) {
        let transaction = &context.transaction_context;
        let accounts: Vec<Value> = (0..transaction.get_number_of_accounts())
            .map(|i| {
                let key = transaction.get_key_of_account_at_index(i).unwrap();
                let account = transaction.accounts().try_borrow(i).unwrap();
                account_json(key, &*account)
            })
            .collect();
        let mut events = self.events.borrow_mut();
        let index = events.len() / 2;
        events.push(json!({"instructionIndex":index, "phase":phase, "accounts":accounts}));
    }
}
impl InvocationInspectCallback for Observer {
    fn before_invocation(
        &self,
        _: &Mollusk,
        _: &Pubkey,
        _: &[u8],
        _: &[InstructionAccount],
        ctx: &mut InvokeContext,
        _: bool,
    ) {
        self.capture("before", ctx);
    }
    fn after_invocation(&self, _: &Mollusk, ctx: &InvokeContext, _: bool) {
        self.capture("after", ctx);
    }
}
fn main() {
    let root = PathBuf::from(env::var("MICROSCOPE_REPO_ROOT").expect("MICROSCOPE_REPO_ROOT"));
    let fixture_path =
        PathBuf::from(env::var("MICROSCOPE_NATIVE_FIXTURE").expect("MICROSCOPE_NATIVE_FIXTURE"));
    let output_path =
        PathBuf::from(env::var("MICROSCOPE_NATIVE_OUTPUT").expect("MICROSCOPE_NATIVE_OUTPUT"));
    assert!(
        !output_path.exists(),
        "refusing to overwrite native evidence"
    );
    let fixture_bytes = fs::read(&fixture_path).unwrap();
    let fixture: Value = serde_json::from_slice(&fixture_bytes).unwrap();
    assert_eq!(fixture["schemaVersion"], "full-bundle-fixture-1");
    let elf =
        fs::read(root.join("output/current-bundle-capture-oaBfzh/current-deployed.so")).unwrap();
    assert_eq!(hash(&elf), ELF_HASH);
    assert_eq!(fixture["elfSha256"], ELF_HASH);
    let program = Pubkey::from_str(fixture["programId"].as_str().unwrap()).unwrap();
    assert_eq!(
        program.to_string(),
        "vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P"
    );
    validate_fixture(&fixture);
    let mut scenarios = Vec::new();
    for scenario in fixture["scenarios"].as_array().unwrap() {
        let mut state = inputs(&scenario["accounts"]);
        let mut transactions = Vec::new();
        for id in scenario["order"].as_array().unwrap() {
            let definition = fixture["transactions"]
                .as_array()
                .unwrap()
                .iter()
                .find(|t| t["id"] == *id)
                .unwrap();
            let count = scenario["instructionCount"].as_u64().unwrap() as usize;
            assert_eq!(count, 5);
            let ix = instructions(&definition["instructions"], count);
            let mut mollusk = Mollusk::default();
            let clock = validated_clock(&scenario["clock"]);
            mollusk.sysvars.clock.slot = clock.slot;
            mollusk.sysvars.clock.epoch_start_timestamp = clock.epoch_start_timestamp;
            mollusk.sysvars.clock.epoch = clock.epoch;
            mollusk.sysvars.clock.leader_schedule_epoch = clock.leader_schedule_epoch;
            mollusk.sysvars.clock.unix_timestamp = clock.unix_timestamp;
            mollusk.compute_budget.compute_unit_limit = 200_000;
            mollusk.logger = Some(LogCollector::new_ref_with_limit(None));
            mollusk.program_cache.add_program(
                &program,
                &solana_sdk_ids::bpf_loader_upgradeable::id(),
                &elf,
            );
            let events = Rc::new(RefCell::new(Vec::new()));
            mollusk.invocation_inspect_callback = Box::new(Observer {
                events: events.clone(),
            });
            let before: Vec<Value> = state.iter().map(|(k, a)| account_json(k, a)).collect();
            let result = mollusk.process_transaction_instructions(&ix, &state);
            let success = result.raw_result.is_ok();
            let after: Vec<Value> = result
                .resulting_accounts
                .iter()
                .map(|(k, a)| account_json(k, a))
                .collect();
            if !success {
                assert_eq!(
                    canonical_state(&state),
                    canonical_state(&result.resulting_accounts),
                    "failed transaction did not roll back ordinary accounts"
                );
            }
            transactions.push(json!({"id":id, "instructionCount":count, "success":success,
                "rawResult":format!("{:?}",result.raw_result), "programResult":format!("{:?}",result.program_result),
                "computeUnitsConsumed":result.compute_units_consumed,
                "logs":mollusk.logger.as_ref().unwrap().borrow().messages,
                "before":before, "instructionEvents":events.borrow().clone(), "after":after}));
            state = result.resulting_accounts;
            if !success {
                break;
            }
        }
        scenarios.push(json!({"id":scenario["id"], "clock":scenario["clock"],
            "requestedOrder":scenario["order"], "transactions":transactions}));
    }
    let evidence = json!({"schemaVersion":"full-bundle-execution-1", "fixtureSha256":hash(&fixture_bytes),
        "exactElfSha256":hash(&elf), "harnessSourceSha256":hash(include_bytes!("main.rs")),
        "runtime":{"name":"mollusk-svm","version":"0.13.1","baseCommit":"f292187b800be56447ac6047cc27d19a922b37a7",
            "runtimeSourceSha256":hash(include_bytes!("../../../cache/native-full-bundle/mollusk/harness/src/lib.rs")),
            "cargoLockSha256":hash(include_bytes!("../Cargo.lock")),
            "observer":"read-only top-level invocation callbacks", "computeUnitLimit":200000,
            "feeDebitsModeled":false,"transactionSignaturesVerified":false,"ed25519InstructionVerified":true,
            "clockFields":"all five observed fields decoded, hash-checked and applied",
            "clockOtherFields":"none: all five fields are captured", "otherRuntimeSysvars":"Mollusk defaults", "instructionsSysvar":"generated separately for each exact instruction sequence",
            "accountPrivileges":"observed transaction-wide privileges","failedTransactionState":"atomic rollback; intermediate observer events are diagnostic"},
        "scenarios":scenarios});
    let bytes = serde_json::to_vec_pretty(&evidence).unwrap();
    let mut output = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&output_path)
        .unwrap();
    output.write_all(&bytes).unwrap();
    output.write_all(b"\n").unwrap();
    println!(
        "Recorded {} scenarios to {}",
        scenarios.len(),
        output_path.display()
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    fn clock() -> Value {
        let bytes: Vec<u8> = [
            503411022u64.to_le_bytes(),
            1790221913i64.to_le_bytes(),
            1165u64.to_le_bytes(),
            1166u64.to_le_bytes(),
            1790243614i64.to_le_bytes(),
        ]
        .concat();
        json!({"slot":503411022u64,"epochStartTimestamp":1790221913i64,"epoch":1165,"leaderScheduleEpoch":1166,"unixTimestamp":1790243614i64,"dataBase64":BASE64.encode(&bytes),"dataSha256":hash(&bytes)})
    }
    fn fixture() -> Value {
        let program = "vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P";
        let ordinary = "11111111111111111111111111111111";
        let account = json!({"address":ordinary,"owner":ordinary,"lamports":"1","executable":false,"rentEpoch":"0","dataBase64":"","dataSha256":hash(&[])});
        let instructions = json!([
            {"programId":"ComputeBudget111111111111111111111111111111","dataHex":"02400d0300","accounts":[]},
            {"programId":"ComputeBudget111111111111111111111111111111","dataHex":"030000000000000000","accounts":[]},
            {"programId":"Ed25519SigVerify111111111111111111111111111","dataHex":"","accounts":[]},
            {"programId":program,"dataHex":"daedaaf5278fa621","accounts":[{"address":ordinary,"signer":false,"writable":true}]},
            {"programId":program,"dataHex":"f717ff41d45addc2","accounts":[]}
        ]);
        let definitions: Vec<Value> = ["anchor-A", "anchor-B", "anchor-C"]
            .iter()
            .map(|id| json!({"id":id,"instructions":instructions}))
            .collect();
        json!({"programId":program,"transactions":definitions,"scenarios":[
            {"id":"ABC","order":["anchor-A","anchor-B","anchor-C"],"instructionCount":5,"mutations":[],"clock":clock(),"accounts":[account]},
            {"id":"ACB","order":["anchor-A","anchor-C","anchor-B"],"instructionCount":5,"mutations":[],"clock":clock(),"accounts":[account]}
        ]})
    }
    fn rejected(value: &Value) {
        assert!(std::panic::catch_unwind(|| validate_fixture(value)).is_err());
    }
    #[test]
    fn validates_all_five_clock_fields_and_hash() {
        let value = clock();
        assert_eq!(validated_clock(&value).epoch, 1165);
        for name in [
            "slot",
            "epochStartTimestamp",
            "epoch",
            "leaderScheduleEpoch",
            "unixTimestamp",
        ] {
            let mut changed = value.clone();
            changed[name] = json!(0);
            assert!(
                std::panic::catch_unwind(|| validated_clock(&changed)).is_err(),
                "unchecked field: {name}"
            );
        }
        let mut changed = value.clone();
        changed["dataSha256"] = json!("00".repeat(32));
        assert!(std::panic::catch_unwind(|| validated_clock(&changed)).is_err());
        let bytes = vec![0u8; 32];
        changed["dataBase64"] = json!(BASE64.encode(&bytes));
        changed["dataSha256"] = json!(hash(&bytes));
        assert!(std::panic::catch_unwind(|| validated_clock(&changed)).is_err());
    }
    #[test]
    fn accepts_complete_unmodified_two_order_fixture() {
        validate_fixture(&fixture());
    }
    #[test]
    fn rejects_post_only_mutations_and_other_compute_limits() {
        let mut value = fixture();
        value["scenarios"][0]["instructionCount"] = json!(4);
        rejected(&value);
        let mut value = fixture();
        value["scenarios"][1]["mutations"] = json!([{"any":"change"}]);
        rejected(&value);
        let mut value = fixture();
        value["transactions"][1]["instructions"][0]["dataHex"] = json!("02410d0300");
        rejected(&value);
    }
    #[test]
    fn rejects_changed_or_missing_ordinary_accounts() {
        let mut value = fixture();
        value["scenarios"][1]["accounts"][0]["lamports"] = json!("2");
        rejected(&value);
        let mut value = fixture();
        for scenario in value["scenarios"].as_array_mut().unwrap() {
            scenario["accounts"] = json!([]);
        }
        rejected(&value);
        let mut value = fixture();
        value["scenarios"][0]["accounts"][0]["dataBase64"] = json!("AQ==");
        rejected(&value);
    }
    #[test]
    fn rejects_changed_roles_orders_and_clock() {
        let mut value = fixture();
        value["transactions"][0]["instructions"][4]["dataHex"] = json!("f717ff41d45addc200");
        rejected(&value);
        let mut value = fixture();
        value["transactions"][2]["id"] = json!("anchor-A");
        rejected(&value);
        let mut value = fixture();
        value["scenarios"][1]["order"] = json!(["anchor-B", "anchor-A", "anchor-C"]);
        rejected(&value);
        let mut value = fixture();
        value["scenarios"][1]["clock"]["epoch"] = json!(0);
        rejected(&value);
        let mut value = fixture();
        value["transactions"][0]["instructions"]
            .as_array_mut()
            .unwrap()
            .pop();
        rejected(&value);
    }
}
