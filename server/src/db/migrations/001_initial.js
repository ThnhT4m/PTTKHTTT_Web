/** PostgreSQL 16. Operational state and transactional slot state are separate. */
export async function up(knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS btree_gist');
  await knex.raw(`
    CREATE TABLE users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name varchar(150) NOT NULL,
      email varchar(254) NOT NULL UNIQUE CHECK (email = lower(email)),
      phone varchar(30),
      password_hash text NOT NULL,
      role varchar(24) NOT NULL DEFAULT 'CUSTOMER'
        CHECK (role IN ('CUSTOMER', 'VENUE_MANAGER', 'ADMIN')),
      is_active boolean NOT NULL DEFAULT true,
      token_version integer NOT NULL DEFAULT 0 CHECK (token_version >= 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE sport_venues (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      manager_id uuid NOT NULL REFERENCES users(id),
      name varchar(150) NOT NULL,
      address varchar(300) NOT NULL,
      district varchar(100) NOT NULL,
      description text NOT NULL DEFAULT '',
      status varchar(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'INACTIVE', 'MAINTENANCE')),
      payment_hold_minutes integer NOT NULL DEFAULT 10
        CHECK (payment_hold_minutes BETWEEN 1 AND 10),
      minimum_online_booking_lead_minutes integer NOT NULL DEFAULT 10
        CHECK (minimum_online_booking_lead_minutes BETWEEN 10 AND 1440),
      version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX sport_venues_manager_idx ON sport_venues(manager_id);

    CREATE TABLE courts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      venue_id uuid NOT NULL REFERENCES sport_venues(id),
      name varchar(150) NOT NULL,
      sport_type varchar(24) NOT NULL
        CHECK (sport_type IN ('FOOTBALL', 'BADMINTON', 'TENNIS', 'PICKLEBALL', 'BASKETBALL')),
      hourly_price integer NOT NULL CHECK (hourly_price >= 0),
      description text NOT NULL DEFAULT '',
      status varchar(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'INACTIVE', 'MAINTENANCE')),
      version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT courts_venue_name_unique UNIQUE (venue_id, name)
    );
    CREATE INDEX courts_venue_idx ON courts(venue_id);

    CREATE TABLE time_slots (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      court_id uuid NOT NULL REFERENCES courts(id),
      slot_date date NOT NULL,
      start_time time NOT NULL,
      end_time time NOT NULL,
      price integer NOT NULL CHECK (price >= 0),
      status varchar(20) NOT NULL DEFAULT 'AVAILABLE'
        CHECK (status IN ('AVAILABLE', 'HELD', 'BOOKED', 'UNAVAILABLE')),
      held_until timestamptz,
      version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT time_slots_court_window_unique UNIQUE (court_id, slot_date, start_time, end_time),
      CONSTRAINT time_slots_valid_window CHECK (
        end_time > start_time AND
        start_time >= time '06:00' AND end_time <= time '22:00' AND
        end_time - start_time = interval '1 hour' AND
        extract(minute FROM start_time) = 0 AND extract(second FROM start_time) = 0
      ),
      CONSTRAINT time_slots_hold_consistency CHECK (
        (status = 'HELD' AND held_until IS NOT NULL) OR
        (status <> 'HELD' AND held_until IS NULL)
      ),
      CONSTRAINT time_slots_no_overlap EXCLUDE USING gist (
        court_id WITH =,
        tsrange(slot_date + start_time, slot_date + end_time, '[)') WITH &&
      )
    );
    CREATE INDEX time_slots_court_date_idx ON time_slots(court_id, slot_date, start_time);
    CREATE INDEX time_slots_expiry_idx ON time_slots(held_until) WHERE status = 'HELD';

    CREATE TABLE bookings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      time_slot_id uuid NOT NULL REFERENCES time_slots(id),
      customer_id uuid REFERENCES users(id),
      customer_name varchar(150),
      customer_phone varchar(30),
      status varchar(30) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'CONFIRMED', 'COMPLETED', 'EXPIRED', 'CANCELLED_BY_VENUE')),
      source varchar(20) NOT NULL
        CHECK (source IN ('ONLINE', 'WALK_IN', 'EXTENSION')),
      parent_booking_id uuid REFERENCES bookings(id),
      total_amount integer NOT NULL CHECK (total_amount >= 0),
      issue_reported_at timestamptz,
      issue_reason text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT bookings_online_customer_required CHECK (source <> 'ONLINE' OR customer_id IS NOT NULL),
      CONSTRAINT bookings_parent_not_self CHECK (parent_booking_id IS NULL OR parent_booking_id <> id)
    );
    CREATE INDEX bookings_customer_idx ON bookings(customer_id);
    CREATE INDEX bookings_parent_idx ON bookings(parent_booking_id);
    CREATE INDEX bookings_slot_idx ON bookings(time_slot_id);
    CREATE UNIQUE INDEX bookings_one_active_per_slot ON bookings(time_slot_id)
      WHERE status IN ('PENDING', 'CONFIRMED', 'COMPLETED');

    CREATE TABLE payments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      booking_id uuid NOT NULL REFERENCES bookings(id),
      method varchar(24) NOT NULL
        CHECK (method IN ('CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'E_WALLET')),
      transaction_code varchar(150) NOT NULL UNIQUE,
      status varchar(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'REFUNDED')),
      amount integer NOT NULL CHECK (amount >= 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX payments_booking_idx ON payments(booking_id);
    CREATE UNIQUE INDEX payments_one_paid_per_booking ON payments(booking_id) WHERE status = 'PAID';

    CREATE TABLE booking_reschedules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      booking_id uuid NOT NULL REFERENCES bookings(id),
      old_time_slot_id uuid NOT NULL REFERENCES time_slots(id),
      new_time_slot_id uuid NOT NULL REFERENCES time_slots(id),
      reason text NOT NULL,
      is_venue_issue boolean NOT NULL DEFAULT false,
      requested_by uuid NOT NULL REFERENCES users(id),
      processed_by uuid REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (old_time_slot_id <> new_time_slot_id)
    );
    CREATE INDEX booking_reschedules_booking_idx ON booking_reschedules(booking_id);

    CREATE TABLE refunds (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      booking_id uuid NOT NULL UNIQUE REFERENCES bookings(id),
      amount integer NOT NULL CHECK (amount >= 0),
      status varchar(20) NOT NULL DEFAULT 'REQUESTED'
        CHECK (status IN ('REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED')),
      reason text NOT NULL,
      requested_by uuid NOT NULL REFERENCES users(id),
      processed_by uuid REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE reviews (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      booking_id uuid NOT NULL UNIQUE REFERENCES bookings(id),
      rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now()
    );

    -- Added for screenshot requirement: privileged status edits must be traceable.
    CREATE TABLE audit_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_id uuid REFERENCES users(id),
      action varchar(100) NOT NULL,
      entity_type varchar(50) NOT NULL,
      entity_id uuid,
      before_data jsonb,
      after_data jsonb,
      reason text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX audit_logs_created_idx ON audit_logs(created_at DESC);
    CREATE INDEX audit_logs_entity_idx ON audit_logs(entity_type, entity_id);
  `);
}

export async function down(knex) {
  await knex.raw(`
    DROP TABLE IF EXISTS audit_logs, reviews, refunds, booking_reschedules,
      payments, bookings, time_slots, courts, sport_venues, users CASCADE;
  `);
  // btree_gist may be shared with other schemas, so intentionally keep it.
}
