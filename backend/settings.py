import os
from pathlib import Path
from dotenv import load_dotenv


# Load variables from backend/.env regardless of the shell working directory.
load_dotenv(dotenv_path=Path(__file__).with_name(".env"))


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:postgres@localhost:5432/postgres",
)
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
CELERY_BROKER = os.getenv("CELERY_BROKER", REDIS_URL)


