export type DataMode = "demo" | "supabase";

export interface SupabasePublicConfigInput {
  mode?: DataMode;
  url?: string;
  anonKey?: string;
}

export interface SupabasePublicConfig {
  url: string;
  anonKey: string;
}

export function resolveSupabasePublicConfig({
  mode,
  url,
  anonKey,
}: SupabasePublicConfigInput): SupabasePublicConfig | null {
  const resolvedMode = mode ?? (url || anonKey ? "supabase" : "demo");
  if (resolvedMode === "demo") return null;

  if (!url || !anonKey) {
    throw new Error("Supabase mode requires a URL and anonymous key.");
  }

  return { url, anonKey };
}

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Table<Row, Insert = Partial<Row>, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

interface TenantRow {
  id: string;
  organisation_id: string;
  created_at: string;
  updated_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: Table<{
        id: string;
        display_name: string;
        created_at: string;
        updated_at: string;
      }>;
      organisations: Table<{
        id: string;
        name: string;
        slug: string;
        status: string;
        created_at: string;
        updated_at: string;
      }>;
      memberships: Table<
        TenantRow & { user_id: string; status: string; joined_at: string | null }
      >;
      roles: Table<TenantRow & { key: string; name: string }>;
      permissions: Table<{
        id: string;
        key: string;
        description: string;
        created_at: string;
      }>;
      role_permissions: Table<
        TenantRow & { role_id: string; permission_id: string }
      >;
      scoped_role_assignments: Table<
        TenantRow & {
          membership_id: string;
          role_id: string;
          scope_kind: "organisation" | "team" | "resource";
          scope_id: string;
          resource_type: string | null;
        }
      >;
      organisation_settings: Table<{
        organisation_id: string;
        settings: Json;
        created_at: string;
        updated_at: string;
      }>;
      entitlements: Table<TenantRow & { key: string; enabled: boolean; config: Json }>;
      seasons: Table<
        TenantRow & {
          name: string;
          starts_on: string;
          ends_on: string;
          is_active: boolean;
        }
      >;
      organisation_invites: Table<
        TenantRow & {
          email: string;
          role_id: string;
          scope_kind: "organisation" | "team" | "resource";
          scope_id: string;
          resource_type: string | null;
          token_digest: string;
          expires_at: string;
          accepted_at: string | null;
          accepted_by: string | null;
        }
      >;
    };
    Views: Record<string, never>;
    Functions: {
      has_active_membership: {
        Args: { requested_organisation_id: string };
        Returns: boolean;
      };
      has_capability: {
        Args: {
          requested_organisation_id: string;
          requested_capability: string;
          requested_scope_kind: "organisation" | "team" | "resource";
          requested_scope_id: string;
          requested_resource_type?: string | null;
        };
        Returns: boolean;
      };
      issue_organisation_invite: {
        Args: {
          requested_organisation_id: string;
          invite_email: string;
          invite_role_id: string;
          invite_scope_kind: "organisation" | "team" | "resource";
          invite_scope_id: string;
          invite_resource_type: string | null;
          invite_token_digest: string;
          invite_expires_at: string;
        };
        Returns: string;
      };
      accept_organisation_invite: {
        Args: { invite_token_digest: string };
        Returns: string;
      };
    };
    Enums: {
      membership_status: "active" | "invited" | "suspended" | "left";
      scope_kind: "organisation" | "team" | "resource";
    };
    CompositeTypes: Record<string, never>;
  };
}
