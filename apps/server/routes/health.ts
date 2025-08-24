import { Router } from "express";

const router = Router();

// Health check
router.get("/healthz", (req, res) => {
  const status = {
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      github_oauth: !!(
        process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ),
      agentdb_config: !!(
        process.env.AGENTDB_TOKEN && process.env.AGENTDB_API_KEY
      ),
      upstash_redis: !!(
        process.env.UPSTASH_REDIS_REST_URL &&
        process.env.UPSTASH_REDIS_REST_TOKEN
      ),
    },
  };
  res.status(200).json(status);
});

export default router;
