CREATE TABLE time_s_status (
    status_id       SERIAL PRIMARY KEY,
    status_code     VARCHAR(30) NOT NULL UNIQUE,   -- e.g. 'CLOCKED_IN', 'CLOCKED_OUT'
    status_name     VARCHAR(50) NOT NULL,          -- e.g. 'Clocked In', 'Clocked Out'
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    display_order   INT4 NOT NULL DEFAULT 0
);

INSERT INTO time_s_status (status_code, status_name, display_order) VALUES
    ('CLOCKED_IN', 'Clocked In', 1),
    ('CLOCKED_OUT', 'Clocked Out', 2);


CREATE TABLE time_t_logs (
  log_id bigserial not null,
  user_id bigint not null,
  status_id bigint not null,
  clock_in_date date not null,
  clock_in_time time without time zone not null,
  clock_out_date date null,
  clock_out_time time without time zone null,
  total_hours numeric(6, 2) null,
  notes character varying(255) null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone null,
  created_by bigint null,
  updated_by bigint null,
  constraint time_t_logs_pkey primary key (log_id),
  constraint fk_timelog_created_by foreign KEY (created_by) references psb_s_user (user_id) on delete set null,
  constraint fk_timelog_status foreign KEY (status_id) references time_s_status (status_id) on delete set null,
  constraint fk_timelog_updated_by foreign KEY (updated_by) references psb_s_user (user_id) on delete set null,
  constraint fk_timelog_user foreign KEY (user_id) references psb_s_user (user_id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_timelog_user_clockin on public.time_t_logs using btree (user_id, clock_in_date) TABLESPACE pg_default;


============================================================

