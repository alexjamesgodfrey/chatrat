export interface AgentDbValidationResult {
  isValid: boolean;
  error?: string;
  components?: {
    token: string;
    dbName: string;
    apiKey: string;
  };
}

export const validateAgentDbString = (
  providerString: string | undefined
): AgentDbValidationResult => {
  if (!providerString) {
    return {
      isValid: false,
      error: "Invalid provider string",
    };
  }

  const [token, dbName, apiKey] = providerString.split(":");

  if (!token || !dbName || !apiKey) {
    return {
      isValid: false,
      error: "Invalid provider string",
    };
  }

  // token is uuid
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(token)) {
    return {
      isValid: false,
      error: "Invalid token format",
    };
  }

  // apiKey contains to agentDB
  if (!apiKey.toLowerCase().includes("agentdb")) {
    return {
      isValid: false,
      error: "Invalid API key format",
    };
  }

  return {
    isValid: true,
    components: {
      token,
      dbName,
      apiKey,
    },
  };
};

export interface PostgresValidationResult {
  isValid: boolean;
  error?: string;
  components?: {
    username: string;
    password: string;
    host: string;
    port: number;
    database: string;
  };
}

export function validatePostgresConnectionString(
  connectionString: string
): PostgresValidationResult {
  return {
    isValid: false,
    error: "Not implemented",
  };
  // if (!connectionString || typeof connectionString !== "string") {
  //   return {
  //     isValid: false,
  //     error: "Connection string must be a non-empty string",
  //   };
  // }

  // const regex = /^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/;
  // const match = connectionString.match(regex);

  // if (!match) {
  //   return {
  //     isValid: false,
  //     error:
  //       "Invalid format. Expected: postgresql://user:pass@host:port/database",
  //   };
  // }

  // const [, username, password, host, portStr, database] = match;
  // const port = parseInt(portStr, 10);

  // if (port < 1 || port > 65535) {
  //   return {
  //     isValid: false,
  //     error: `Invalid port: ${port}`,
  //   };
  // }

  // return {
  //   isValid: true,
  //   components: {
  //     username,
  //     password,
  //     host,
  //     port,
  //     database,
  //   },
  // };
}

export const validateProviderString = (providerString: string) => {
  return (
    validateAgentDbString(providerString).isValid ||
    validatePostgresConnectionString(providerString).isValid
  );
};
