-- Adds prepaid/postpaid billing type to Software subscriptions/reminders.

alter table public.software_subscriptions
  add column if not exists billing_type text not null default 'prepaid';

alter table public.software_subscriptions
  drop constraint if exists software_subscriptions_billing_type_check;

alter table public.software_subscriptions
  add constraint software_subscriptions_billing_type_check
  check (billing_type in ('prepaid', 'postpaid'));
