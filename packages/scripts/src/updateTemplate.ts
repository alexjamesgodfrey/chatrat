import { template } from "@chatrat/config/template";
import { DatabaseService } from "@agentdb/sdk";

const apiKey = process.env.AGENTDB_API_KEY;
const service = new DatabaseService(
  "https://api.agentdb.dev/",
  apiKey!,
  false
);

service.createTemplate(
    template.name,
    template.migrations,
    template.description,
)
.then(console.log)
.catch(console.error)

