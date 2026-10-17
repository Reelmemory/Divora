import { createHealthServer } from "./server.js";

const port = Number(process.env.PORT ?? 4100);
const server = createHealthServer();

server.listen(port, () => {
  console.log(JSON.stringify({ service: "divora-terminal", port, phase: "0" }));
});
