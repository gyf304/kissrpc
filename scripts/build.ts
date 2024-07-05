import { $ } from "bun";

for (const pkg of ["client", "jsonrpc", "server"]) {
	await $`cd packages/${pkg} && bun run build`;
}
