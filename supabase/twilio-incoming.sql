-- The forwarding destination is explicit, per connection, and never inferred from contact data.
alter table public.twilio_connections
  add column if not exists incoming_forward_number text
  check (incoming_forward_number is null or
    (incoming_forward_number ~ '^\+[1-9][0-9]{7,14}$' and incoming_forward_number <> phone_number));
