CREATE TABLE people (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE productions (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE storyboard_tasks (
  id text PRIMARY KEY,
  production_id text NOT NULL REFERENCES productions(id),
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE work_logs (
  id text PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  person_id text NOT NULL REFERENCES people(id),
  production_id text NOT NULL REFERENCES productions(id),
  task_id text NOT NULL REFERENCES storyboard_tasks(id),
  work_date date NOT NULL,
  hours double precision NOT NULL CHECK (hours >= 0),
  completed_shots integer NOT NULL CHECK (completed_shots >= 0),
  complexity_weight double precision NOT NULL CHECK (complexity_weight > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX work_logs_dimensions_idx ON work_logs(production_id, person_id, work_date);
