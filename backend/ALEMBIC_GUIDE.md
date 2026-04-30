# Alembic Migrations Guide

Use this guide when changing SQLAlchemy models in `backend/models.py`.

## Project-Specific Setup

- Alembic config lives in `backend/alembic.ini`
- Migration scripts live in `backend/migrations/versions/`
- `backend/migrations/env.py` loads `DATABASE_URL` from `backend/settings.py`

Because of that `env.py` wiring, your `backend/.env` values are used when running Alembic.

## Quick Workflow

```fish
cd "Work Sample/backend"
alembic revision --autogenerate -m "describe_change"
alembic upgrade head
```

Before running those commands, ensure your target DB is reachable and `DATABASE_URL` points to the expected environment.

## Common Commands

```fish
cd "Work Sample/backend"
alembic current
alembic history
alembic upgrade head
alembic downgrade -1
alembic downgrade aaabc02bf9db
```

Manual migration stub (no autogenerate):

```fish
cd "Work Sample/backend"
alembic revision -m "manual_change"
```

## Recommended Migration Review

After `--autogenerate`, always review the new file in `migrations/versions/`:

1. Verify table/column names are correct
2. Verify nullability and defaults are what you intend
3. Confirm `upgrade()` and `downgrade()` are reversible

Autogenerate is helpful but not perfect, especially for renames and data migrations.

## Common Scenarios

### Add Column

1. Update model
2. Generate migration with `--autogenerate`
3. Review generated `op.add_column(...)`
4. Apply with `alembic upgrade head`

### Rename Column

Alembic usually detects this as drop + add. Replace that with a safe rename operation manually in migration script.

### Add NOT NULL Column to Existing Table

Use a staged migration pattern:

1. Add column as nullable or with a server default
2. Backfill existing rows
3. Enforce NOT NULL via `op.alter_column(...)`

## Troubleshooting

### "Target database is not up to date"

```fish
cd "Work Sample/backend"
alembic current
alembic upgrade head
```

### Wrong DB Gets Migrated

Check `DATABASE_URL` in `backend/.env` and shell environment.

### Migration Fails on Constraints

Edit migration to handle existing data first (defaults/backfill), then tighten constraints.

## CI/CD and Deploys

Run migrations before starting API/worker processes:

```fish
cd "Work Sample/backend"
alembic upgrade head
```

In Docker Compose, backend startup already runs `alembic upgrade head` before `uvicorn`.

## Safety Checklist

- Keep each migration focused on one logical change
- Test upgrade and downgrade in a dev DB
- Never edit `alembic_version` manually
- Commit migration scripts to version control
- Back up data before production migrations

## References

- https://alembic.sqlalchemy.org/
- https://docs.sqlalchemy.org/

