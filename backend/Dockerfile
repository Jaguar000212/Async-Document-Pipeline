FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
	PYTHONUNBUFFERED=1

WORKDIR /app

# Install backend dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source into the image
COPY . .

EXPOSE 8000

# Default command for local runs; docker-compose can override this.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

