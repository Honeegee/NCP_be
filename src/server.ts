import { env } from "./config/env";
import { app } from "./app";

const PORT = env.PORT;

app.listen(PORT, () => {
  console.log(`[NCPnext API] Server running on http://localhost:${PORT}`);
  console.log(`[NCPnext API] Environment: ${env.NODE_ENV}`);
  console.log(`[NCPnext API] CORS origin: ${env.CORS_ORIGIN}`);
});
