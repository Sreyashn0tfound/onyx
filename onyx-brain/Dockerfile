FROM python:3.11-slim

# Install system dependencies (espeak-ng for TTS phonemizer, ffmpeg for audio, libgl for OpenCV)
RUN apt-get update && apt-get install -y --no-install-recommends \
    espeak-ng \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency definition and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY . .

# Set environment
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV HOST=0.0.0.0
ENV PORT=8000

EXPOSE 8000

# Start server
CMD ["python", "main.py"]
