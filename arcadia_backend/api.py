from fastapi import FastAPI

api = FastAPI()

@api.get("/health")
def health():
    return {"status": "ok"}
