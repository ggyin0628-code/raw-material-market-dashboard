const { initializePrivateOperatorDirectory, validateLocalOperatorReadiness, runPrivateLeakCheck, formatInitStatus, formatValidationStatus, formatLeakCheckStatus } = require("../lib/engineering/privateOperatorReadiness");

function print(lines) {
  process.stdout.write(`${lines.join("\n")}\n`);
}

function main(argv = process.argv, environment = process.env) {
  const command = argv[2];
  try {
    if (command === "init") {
      const destination = argv[3];
      const result = initializePrivateOperatorDirectory(destination);
      print(formatInitStatus(result));
      return 0;
    }
    if (command === "validate") {
      const result = validateLocalOperatorReadiness({ environment });
      print(formatValidationStatus(result));
      return result.ok ? 0 : 1;
    }
    if (command === "leak-check") {
      const result = runPrivateLeakCheck();
      print(formatLeakCheckStatus(result));
      return result.ok ? 0 : 1;
    }
    process.stderr.write("Usage: node scripts/private-operator.js <init|validate|leak-check> [external-directory]\n");
    return 2;
  } catch {
    process.stdout.write("READY_FOR_PRIVATE_PILOT: NO\n");
    return 1;
  }
}

if (require.main === module) process.exitCode = main();

module.exports = { main };
