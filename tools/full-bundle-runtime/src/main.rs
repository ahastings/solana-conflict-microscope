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
    cell::RefCell, collections::HashSet, env, fs, io::Write, path::PathBuf, rc::Rc, str::FromStr,
};

const ELF_HASH: &str = "89d757b837724ab552d1ebf719245e33f9f93b722cb4331b5eec55202d94ca5c";
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
    let elf = fs::read(root.join("cache/research/velocity-equality-replay/velocity-deployed.so"))
        .unwrap();
    assert_eq!(hash(&elf), ELF_HASH);
    assert_eq!(fixture["elfSha256"], ELF_HASH);
    let program = Pubkey::from_str(fixture["programId"].as_str().unwrap()).unwrap();
    assert_eq!(
        program.to_string(),
        "vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P"
    );
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
            assert!(count == 4 || count == 5);
            let ix = instructions(&definition["instructions"], count);
            let mut mollusk = Mollusk::default();
            mollusk.sysvars.clock.slot = scenario["clock"]["slot"].as_u64().unwrap();
            mollusk.sysvars.clock.unix_timestamp =
                scenario["clock"]["unixTimestamp"].as_i64().unwrap();
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
            "clockOtherFields":"Mollusk defaults (0)", "instructionsSysvar":"generated separately for each exact instruction sequence",
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
