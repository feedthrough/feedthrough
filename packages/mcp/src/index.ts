import { startServer } from "./server.js";

const port = parseInt(process.env["FEEDTHROUGH_PORT"] ?? "8765", 10);

startServer(port).catch((err) => {
  process.stderr.write(`[feedthrough] failed to start: ${err}\n`);
  process.exit(1);
});
