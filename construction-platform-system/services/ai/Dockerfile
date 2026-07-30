# Deploy-stub container for the AI tier (§9). Runs the FastAPI health surface; the
# seam worker runs as a second command/replica in the real deploy.
FROM python:3.12-slim
WORKDIR /app
COPY services/ai/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY services/ai/app ./app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
