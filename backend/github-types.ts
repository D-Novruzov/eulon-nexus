export interface GitHubUser {
  id: number;
  login: string;
  name?: string;
  avatar_url?: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  owner: {
    login: string;
    id: number;
  };
  description: string | null;
  default_branch: string;
  language: string | null;
  visibility?: "public" | "private" | "internal";
}

export interface NormalizedRepo {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  description: string | null;
  defaultBranch: string;
  language: string | null;
  visibility: "public" | "private" | "internal";
}

export interface GitHubImportRequest {
  repos: Array<{
    id: number;
    owner: string;
    name: string;
    defaultBranch?: string;
  }>;
}

export interface GitHubImportResult {
  imports: Array<{
    id: number;
    owner: string;
    name: string;
    defaultBranch: string;
    commitHash: string;
    source: "github";
  }>;
}


