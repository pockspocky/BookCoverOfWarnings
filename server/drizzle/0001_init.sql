create table students (
  id uuid primary key,
  display_name text not null,
  graduation_year integer not null,
  general_comment text not null default '',
  archived_at timestamptz,
  current_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table student_private_profiles (
  student_id uuid primary key references students (id),
  sexuality_preset text,
  sexuality_custom text,
  updated_at timestamptz not null default now()
);

create table accounts (
  id uuid primary key,
  email text not null unique,
  password_hash text not null,
  email_verified boolean not null default false,
  role text not null check (role in ('member', 'administrator')),
  matched_student_id uuid references students (id),
  match_status text not null check (match_status in ('pending', 'verified', 'disputed', 'corrected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table roster_mappings (
  id uuid primary key,
  email text not null unique,
  student_id uuid not null references students (id),
  created_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key,
  account_id uuid not null references accounts (id) on delete cascade,
  token_hash text not null unique,
  csrf_token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index sessions_account_id_idx on sessions (account_id);

create table trait_categories (
  id uuid primary key,
  name text not null,
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table traits (
  id uuid primary key,
  student_id uuid not null references students (id),
  title text not null,
  category_id uuid not null references trait_categories (id),
  description text,
  status text not null check (status in ('active', 'archived')),
  current_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index traits_student_id_idx on traits (student_id);

create table evidence (
  id uuid primary key,
  provider_user_id uuid not null references accounts (id),
  summary text not null,
  evidence_date date not null,
  urls jsonb not null default '[]'::jsonb,
  verification_status text not null check (verification_status in ('pending', 'verified', 'insufficient', 'disputed')),
  reliability_score integer check (reliability_score is null or reliability_score between 1 and 5),
  status text not null check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table evidence_attachments (
  id uuid primary key,
  evidence_id uuid not null references evidence (id),
  file_name text not null,
  content_type text not null,
  size_bytes integer not null,
  authorized boolean not null default false,
  object_key text,
  created_at timestamptz not null default now()
);

create index evidence_attachments_evidence_id_idx on evidence_attachments (evidence_id);

create table trait_evidence (
  id uuid primary key,
  trait_id uuid not null references traits (id),
  evidence_id uuid not null references evidence (id),
  created_at timestamptz not null default now(),
  unique (trait_id, evidence_id)
);

create table groups (
  id uuid primary key,
  name text not null,
  description text not null default '',
  current_version integer not null default 1,
  status text not null check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table group_roles (
  id uuid primary key,
  name text not null,
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table group_memberships (
  id uuid primary key,
  group_id uuid not null references groups (id),
  student_id uuid not null references students (id),
  role_id uuid not null references group_roles (id),
  start_date date not null,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index group_memberships_group_id_idx on group_memberships (group_id);
create index group_memberships_student_id_idx on group_memberships (student_id);

create table relationship_types (
  id uuid primary key,
  name text not null,
  description text not null default '',
  category text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table relationships (
  id uuid primary key,
  source_type text not null check (source_type in ('student', 'group')),
  source_id uuid not null,
  target_type text not null check (target_type in ('student', 'group')),
  target_id uuid not null,
  relationship_type_id uuid not null references relationship_types (id),
  general_comment text not null default '',
  start_date date,
  end_date date,
  status text not null check (status in ('active', 'ended', 'archived')),
  current_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not (source_type = target_type and source_id = target_id))
);

create index relationships_source_idx on relationships (source_type, source_id);
create index relationships_target_idx on relationships (target_type, target_id);

create table submissions (
  id uuid primary key,
  submitter_user_id uuid not null references accounts (id),
  entity_type text not null,
  operation text not null check (operation in ('create', 'update', 'archive', 'correction')),
  target_entity_id uuid,
  proposed_data jsonb not null,
  status text not null check (status in ('pending', 'awaiting_consent', 'approved', 'rejected')),
  submitted_at timestamptz not null,
  reviewed_at timestamptz,
  reviewed_by uuid,
  consent_requirements jsonb not null default '[]'::jsonb,
  base_version integer,
  batch_id uuid,
  created_at timestamptz not null default now()
);

create index submissions_batch_id_idx on submissions (batch_id);
create index submissions_status_idx on submissions (status);

create table consent_grants (
  id uuid primary key,
  subject_student_id uuid not null references students (id),
  scope text not null,
  entity_type text not null,
  entity_id uuid,
  pending_submission_id uuid references submissions (id) on delete cascade,
  granted_at timestamptz,
  revoked_at timestamptz,
  status text not null check (status in ('granted', 'revoked', 'pending'))
);

create index consent_grants_submission_idx on consent_grants (pending_submission_id);
create index consent_grants_entity_idx on consent_grants (entity_type, entity_id);

create table record_revisions (
  id uuid primary key,
  entity_type text not null,
  entity_id uuid not null,
  version integer not null,
  previous_values jsonb not null,
  new_values jsonb not null,
  changed_at timestamptz not null,
  effective_date date,
  changed_by_user_id uuid not null references accounts (id)
);

create index record_revisions_entity_idx on record_revisions (entity_type, entity_id);

create table audit_events (
  id uuid primary key,
  action text not null,
  actor_user_id uuid,
  entity_type text,
  entity_id uuid,
  occurred_at timestamptz not null
);

create table field_definitions (
  id uuid primary key,
  entity_type text not null,
  key text not null,
  value_type text not null check (value_type in ('string', 'number', 'date', 'enum', 'markdown')),
  visibility text not null check (visibility in ('published', 'admin_only', 'subject_private')),
  requires_consent boolean not null default false,
  searchable boolean not null default false,
  unique (entity_type, key)
);

create table field_values (
  id uuid primary key,
  definition_id uuid not null references field_definitions (id),
  entity_id uuid not null,
  value_text text not null,
  unique (definition_id, entity_id)
);

create table private_attribute_values (
  id uuid primary key,
  definition_id uuid not null references field_definitions (id),
  entity_id uuid,
  subject_student_id uuid not null references students (id),
  pending_submission_id uuid references submissions (id) on delete cascade,
  value_text text not null,
  created_at timestamptz not null default now()
);

create table search_documents (
  entity_type text not null,
  entity_id uuid not null,
  title text not null,
  subtitle text not null,
  href text not null,
  filters jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (entity_type, entity_id)
);

create table rate_limit_events (
  id uuid primary key,
  account_id uuid not null references accounts (id) on delete cascade,
  action text not null,
  occurred_at timestamptz not null
);

create index rate_limit_events_window_idx on rate_limit_events (account_id, action, occurred_at);

create table upload_tickets (
  id uuid primary key,
  token_hash text not null unique,
  evidence_id uuid not null references evidence (id),
  attachment_id uuid not null references evidence_attachments (id),
  account_id uuid not null references accounts (id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
