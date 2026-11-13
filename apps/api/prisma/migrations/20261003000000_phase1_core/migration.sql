CREATE TABLE "users" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "full_name" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "roles" ("id" TEXT NOT NULL PRIMARY KEY, "code" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL);
CREATE TABLE "permissions" ("id" TEXT NOT NULL PRIMARY KEY, "code" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL);
CREATE TABLE "user_roles" (
  "user_id" TEXT NOT NULL,
  "role_id" TEXT NOT NULL,
  CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id"),
  CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");
CREATE TABLE "role_permissions" (
  "role_id" TEXT NOT NULL,
  "permission_id" TEXT NOT NULL,
  CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id"),
  CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");
CREATE TABLE "sessions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "token_hash" TEXT NOT NULL UNIQUE,
  "user_id" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ip_address" TEXT,
  "user_agent" TEXT,
  CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");
CREATE TABLE "password_reset_tokens" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "token_hash" TEXT NOT NULL UNIQUE,
  "user_id" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");
CREATE TABLE "audit_logs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "actor_id" TEXT,
  "action" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entity_id" TEXT,
  "changes" JSONB,
  "ip_address" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id","created_at");
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity","entity_id");
