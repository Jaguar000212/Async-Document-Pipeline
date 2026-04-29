# Alembic Migrations Guide

## Quick Reference

### When You Modify a Model
1. Update the model in `models.py`
2. Create a migration:
   ```bash
   cd backend
   alembic revision --autogenerate -m "descriptive_message"
   ```
3. Review the generated migration file in `migrations/versions/`
4. Apply the migration:
   ```bash
   alembic upgrade head
   ```

### Common Alembic Commands

#### View Migration History
```bash
alembic current        # Show current revision
alembic history        # Show all revisions
```

#### Rollback a Migration
```bash
alembic downgrade -1   # Rollback one migration
alembic downgrade aaabc02bf9db  # Rollback to specific revision
```

#### Create Manual Migration
```bash
alembic revision -m "message"  # Without autogenerate
# Then edit the migration file manually
```

## Development Workflow

### Scenario 1: Adding a New Column
```python
# In models.py - add to Document class:
new_column = Column(String, nullable=True)

# In terminal:
alembic revision --autogenerate -m "add_new_column_to_documents"
alembic upgrade head
```

### Scenario 2: Renaming a Column
```bash
# Create migration
alembic revision -m "rename_column"

# Edit migrations/versions/*.py and modify the upgrade/downgrade functions
# to use op.alter_column() instead of drop/create

# Apply migration
alembic upgrade head
```

### Scenario 3: Adding NOT NULL Column with Existing Data
```python
# The migration will automatically create with nullable=True
# and use ALTER COLUMN to enforce NOT NULL constraint

# Alembic handles this intelligently when autogenerating
alembic revision --autogenerate -m "add_required_field"
```

## Troubleshooting

### Migration Fails Due to Data Constraints
**Problem**: Can't add NOT NULL column to table with existing rows

**Solution**: The migration should use server defaults. If it doesn't:
1. Edit the migration file
2. Add `server_default` when adding the column
3. Use `alter_column()` to enforce NOT NULL after data is populated

Example:
```python
op.add_column('table', sa.Column('new_col', sa.Integer(), 
              nullable=True, server_default='0'))
op.alter_column('table', 'new_col', nullable=False)
```

### "Target database is not up to date" Error
```bash
# Check current state
alembic current

# Apply pending migrations
alembic upgrade head
```

### Alembic Loses Track of Migrations
```bash
# Check alembic_version table
# This table tracks which migrations have been applied
# Usually indicates database connection issue or wrong DATABASE_URL
```

## Configuration Files

### `alembic.ini`
- Main Alembic configuration
- Contains database URL setting (auto-populated from settings.py)
- Logging configuration
- Script location

### `migrations/env.py`
- Runs during migrations
- Imports models and settings
- Configures target_metadata for autogeneration
- Sets up database connection

### `migrations/script.py.mako`
- Template for new migration files
- Only modify if you want to customize migration file format

## Important Files to Track

Make sure to commit these to version control:
- `alembic.ini`
- `migrations/env.py`
- `migrations/script.py.mako`
- `migrations/versions/*.py` (all migration files)

**.gitignore** should NOT include:
- Migration files (they must be shared)

## Integration with CI/CD

When deploying:
```bash
# In your deployment script:
cd backend
alembic upgrade head
# Then start the application
```

## Safety Tips

1. **Always test migrations in development first**
   - Apply migration locally
   - Run tests
   - Verify data integrity

2. **Keep migrations small and focused**
   - One logical change per migration
   - Easier to understand and rollback if needed

3. **Write down what each migration does**
   - Use descriptive names
   - Add comments in migration files if complex

4. **Never manually edit alembic_version table**
   - This tracks applied migrations
   - Alembic manages it automatically

5. **Backup database before production migrations**
   - Always, always backup
   - Test rollback procedures

## Example: Complete Development Cycle

```bash
# 1. Modify model
# Edit models.py, add new_field = Column(String)

# 2. Generate migration
alembic revision --autogenerate -m "add_new_field_to_document"

# 3. Review migration file
cat migrations/versions/[revision_id]_add_new_field_to_document.py

# 4. Test locally
alembic upgrade head
pytest tests/

# 5. Commit
git add alembic.ini migrations/versions/[revision_id]_*.py
git commit -m "Add new_field to Document model"

# 6. Deploy
# In production/staging deploy script:
alembic upgrade head
```

## Resources
- [Alembic Documentation](https://alembic.sqlalchemy.org/)
- [SQLAlchemy Upgrade Guide](https://docs.sqlalchemy.org/)
- [FastAPI + Alembic Tutorial](https://alembic.sqlalchemy.org/en/latest/tutorial/)

