declare global {
  namespace Express {
    interface Request {
      session?: {
        githubToken: string;
        githubUser: {
          id: number;
          login: string;
          name: string;
          email: string | null;
        };
        dbProviderType: "postgres" | "agentdb";
        connectionString?: string;
      };
      body: any; // Explicitly declare body property
    }
  }
}

// Make this a module
export {};
