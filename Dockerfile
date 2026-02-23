# Use official Python 3.10 slim image
FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Install system dependencies
# If you explicitly need git for pip install git+... urls, add it back.

# Copy requirements first to leverage Docker cache
COPY requirements-lite.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements-lite.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# Extract version from pyproject.toml into a plain file for runtime
COPY pyproject.toml /tmp/pyproject.toml
RUN python -c "import re; t=open('/tmp/pyproject.toml').read(); m=re.search(r'^version\s*=\s*\"([^\"]+)\"', t, re.M); open('VERSION','w').write(m.group(1) if m else '0.0.0')" && rm /tmp/pyproject.toml

# Copy application code
COPY app ./app
COPY frontend/dist ./frontend/dist

# Create necessary directories
RUN mkdir -p data logs

# Set Environment Variables
ENV PYTHONUNBUFFERED=1

# Expose port
EXPOSE 5023

# Command to run the server directly
CMD ["uvicorn", "app.server:app", "--host", "0.0.0.0", "--port", "5023"]
