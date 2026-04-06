FROM python:3.12-slim

# Install Node.js 20
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Node dependencies (pptxgenjs)
COPY package.json .
RUN npm install --production

# Copy application code
COPY . .

# Copy master template
COPY master_template.pptx /app/master_template.pptx

# Output directory
RUN mkdir -p /tmp/ppt_output

EXPOSE 8501

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8501"]
