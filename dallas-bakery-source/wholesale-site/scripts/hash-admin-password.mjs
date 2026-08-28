import { pbkdf2Sync, randomBytes } from "node:crypto";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const password = Buffer.concat(chunks).toString("utf8").replace(/[\r\n]+$/, "");

if (
  password.length < 14 ||
  password.length > 128 ||
  !/[A-Za-z]/.test(password) ||
  !/\d/.test(password)
) {
  console.error("Password must be 14–128 characters and include a letter and a number.");
  process.exit(1);
}

const iterations = 210_000;
const salt = randomBytes(18);
const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256");
process.stdout.write(`pbkdf2_sha256$${iterations}$${salt.toString("base64url")}$${hash.toString("base64url")}\n`);
