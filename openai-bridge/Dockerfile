FROM python
WORKDIR /usr/src/app
COPY . .
RUN pip install -r requirements.txt
ENTRYPOINT ["sh", "-c"]
EXPOSE 8000
CMD ["python -m uvicorn --host 0.0.0.0 --port 8000 main:app"]
