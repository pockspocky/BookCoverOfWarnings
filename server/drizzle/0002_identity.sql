alter table accounts alter column password_hash drop not null;
alter table accounts add column oidc_issuer text;
alter table accounts add column oidc_subject text;
create unique index accounts_oidc_identity on accounts (oidc_issuer, oidc_subject);

create table oidc_transactions (
  state text primary key,
  code_verifier text not null,
  nonce text not null,
  next_path text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
