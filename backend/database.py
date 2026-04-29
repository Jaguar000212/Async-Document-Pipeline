from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from settings import DATABASE_URL

# Create SQLAlchemy engine (sync). pool_pre_ping helps with stale connections in long-running apps.
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

# Session factory for use in FastAPI dependencies and Celery tasks
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()


def get_db():
    """
    Dependency to provide a SQLAlchemy session and ensure it's closed after use.
    Usage in FastAPI endpoints:
        db: Session = Depends(get_db)
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


