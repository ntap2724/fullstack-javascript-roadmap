const command = process.argv[2];
console.error(`${command} is not available until its owning work package is merged`);
process.exitCode = 2;
