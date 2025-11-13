from fastapi import FastAPI, File, UploadFile, Form, Depends, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from typing import List, Optional
import os
import motor.motor_asyncio
import uuid
from datetime import datetime, timedelta
import PyPDF2
import google.generativeai as genai
from langchain.text_splitter import RecursiveCharacterTextSplitter
import numpy as np
import pdfplumber

# Remove environment variable loading
GEMINI_API_KEY = None  # We'll handle this later
print("Running without Gemini API key")

app = FastAPI()

# Allow CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# MongoDB setup
MONGO_URL = "mongodb://localhost:27017"
client = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URL)
db = client["pdf_chat_app"]
users_collection = db["users"]
pdfs_collection = db["pdfs"]
chats_collection = db["chats"]

# Auth settings
SECRET_KEY = "supersecretkey"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/token")

# User helpers
async def get_user(username: str):
    return await users_collection.find_one({"username": username})

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = await get_user(username)
    if user is None:
        raise credentials_exception
    return user

@app.post("/register")
async def register(username: str = Form(...), password: str = Form(...)):
    if await users_collection.find_one({"username": username}):
        raise HTTPException(status_code=400, detail="Username already registered")
    hashed_password = get_password_hash(password)
    await users_collection.insert_one({"username": username, "hashed_password": hashed_password})
    return {"msg": "User registered successfully"}

@app.post("/token")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = await get_user(form_data.username)
    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    access_token = create_access_token(data={"sub": user["username"]})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/")
def read_root():
    return {"message": "PDF Chat App backend is running!"}

@app.get("/options/languages")
def get_languages():
    return ["English", "Hindi", "Kannada", "Marathi", "Tamil", "Spanish", "German", "French", "Chinese", "Japanese"]

@app.get("/options/answer-formats")
def get_answer_formats():
    return ["points", "paragraph", "summary"]

CHUNK_SIZE = 1500
CHUNK_OVERLAP = 200

# Helper: get Gemini embedding
async def get_gemini_embedding(text: str):
    try:
        model = genai.EmbeddingModel("models/embedding-001")
        response = model.embed_content(text)
        return response["embedding"]
    except Exception as e:
        print(f"Gemini embedding error: {e}")
        return None

# Helper: cosine similarity
def cosine_similarity(a, b):
    a = np.array(a)
    b = np.array(b)
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

@app.post("/upload-pdf")
async def upload_pdf(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    if not file.filename.lower().endswith(".pdf"):
        return JSONResponse(status_code=400, content={"error": "Only PDF files are allowed."})
    file_id = str(uuid.uuid4())
    save_path = os.path.join(UPLOAD_DIR, file_id + "_" + file.filename)
    content = await file.read()
    file_size = len(content)
    if file_size > 500 * 1024 * 1024:
        return JSONResponse(status_code=400, content={"error": "File size exceeds 500MB limit."})
    with open(save_path, "wb") as f:
        f.write(content)
    # Parse PDF text
    pdf_text = ""
    try:
        with open(save_path, "rb") as f:
            reader = PyPDF2.PdfReader(f)
            for page in reader.pages:
                pdf_text += page.extract_text() or ""
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"PDF parsing failed: {str(e)}"})
    # Extract images using pdfplumber
    image_metadata = []
    try:
        with pdfplumber.open(save_path) as pdf:
            for page_num, page in enumerate(pdf.pages):
                images = page.images
                for img_idx, img in enumerate(images):
                    # Extract the image
                    im = page.to_image(resolution=150)
                    # Crop to the image bbox
                    cropped = im.original.crop((img["x0"], img["top"], img["x1"], img["bottom"]))
                    img_filename = f"{file_id}_img_{page_num+1}_{img_idx+1}.png"
                    img_path = os.path.join(UPLOAD_DIR, img_filename)
                    cropped.save(img_path)
                    image_metadata.append({
                        "page": page_num+1,
                        "img_idx": img_idx+1,
                        "filename": img_filename
                    })
    except Exception as e:
        print(f"Image extraction failed: {e}")
    # Chunk PDF text using LangChain
    try:
        splitter = RecursiveCharacterTextSplitter(chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP)
        chunks = splitter.split_text(pdf_text)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"Chunking failed: {str(e)}"})
    # Get Gemini embeddings for each chunk
    chunk_objs = []
    for chunk in chunks:
        embedding = await get_gemini_embedding(chunk)
        chunk_objs.append({"text": chunk, "embedding": embedding})
    # Store PDF metadata, text, chunk objects, and image metadata in MongoDB
    pdf_doc = {
        "_id": file_id,
        "filename": file.filename,
        "path": save_path,
        "size": file_size,
        "owner": current_user["username"],
        "text": pdf_text,
        "chunks": chunk_objs,
        "images": image_metadata
    }
    await pdfs_collection.insert_one(pdf_doc)
    return {"filename": file.filename, "file_id": file_id, "size": file_size, "num_chunks": len(chunk_objs), "num_images": len(image_metadata)}

@app.get("/user-pdfs")
async def user_pdfs(current_user: dict = Depends(get_current_user)):
    pdfs = await pdfs_collection.find({"owner": current_user["username"]}).to_list(100)
    return [{"file_id": pdf["_id"], "filename": pdf["filename"]} for pdf in pdfs]

@app.get("/chat-history")
async def chat_history(file_id: str = Query(...), current_user: dict = Depends(get_current_user)):
    chats = await chats_collection.find({"pdf_file_id": file_id, "user": current_user["username"]}).to_list(100)
    return [{"question": chat["question"], "answer": chat["answer"]} for chat in chats]

@app.post("/chat")
async def chat(
    question: str = Form(...),
    file_id: str = Form(...),
    answer_format: str = Form(...),
    response_language: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    # Find the PDF chunks
    pdf_doc = await pdfs_collection.find_one({"_id": file_id, "owner": current_user["username"]})
    if not pdf_doc or not pdf_doc.get("chunks"):
        return JSONResponse(status_code=404, content={"error": "PDF not found or chunking failed."})
    chunk_objs = pdf_doc["chunks"]
    # Keyword-based retrieval
    question_keywords = set(question.lower().split())
    relevant_chunks = [chunk['text'] for chunk in chunk_objs if any(word in chunk['text'].lower() for word in question_keywords)]
    if not relevant_chunks:
        relevant_chunks = [chunk['text'] for chunk in chunk_objs[:3]]
    context = "\n---\n".join(relevant_chunks[:5])
    # Compose prompt for Gemini
    prompt = f"You are an AI assistant. Here are relevant parts of a PDF:\n{context}\n\nUser's question: {question}\n\nPlease answer in {response_language} and format as {answer_format}."
    answer = "[Gemini API not configured]"
    if GEMINI_API_KEY:
        try:
            model = genai.GenerativeModel('gemini-1.5-flash')
            response = model.generate_content(prompt)
            answer = response.text
        except Exception as e:
            answer = f"Error from Gemini: {str(e)}"
    # Find relevant images if the question references images/figures/pages
    images = []
    if "images" in pdf_doc:
        import re
        # Look for keywords and page numbers in the question
        keywords = ["image", "figure", "diagram", "photo", "picture"]
        found = any(kw in question.lower() for kw in keywords)
        page_matches = re.findall(r"page (\d+)", question.lower())
        page_nums = set(int(p) for p in page_matches)
        for img in pdf_doc["images"]:
            if found:
                # If keywords found, include all images or those on mentioned pages
                if not page_nums or img["page"] in page_nums:
                    images.append(f"/pdf-image?file_id={file_id}&image={img['filename']}")
            elif page_nums and img["page"] in page_nums:
                images.append(f"/pdf-image?file_id={file_id}&image={img['filename']}")
    # Store chat in MongoDB
    chat_doc = {
        "question": question,
        "pdf_file_id": file_id,
        "answer_format": answer_format,
        "response_language": response_language,
        "answer": answer,
        "user": current_user["username"]
    }
    await chats_collection.insert_one(chat_doc)
    return {
        "question": question,
        "pdf": file_id,
        "answer_format": answer_format,
        "response_language": response_language,
        "answer": answer,
        "images": images
    }

@app.delete("/delete-pdf")
async def delete_pdf(file_id: str = Query(...), current_user: dict = Depends(get_current_user)):
    # Find the PDF document
    pdf_doc = await pdfs_collection.find_one({"_id": file_id, "owner": current_user["username"]})
    if not pdf_doc:
        return JSONResponse(status_code=404, content={"error": "PDF not found or not owned by user."})
    # Remove the file from the uploads directory
    file_path = pdf_doc.get("path")
    if file_path and os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception as e:
            return JSONResponse(status_code=500, content={"error": f"Failed to delete file: {str(e)}"})
    # Delete the PDF document from the database
    await pdfs_collection.delete_one({"_id": file_id})
    # Delete related chat history
    await chats_collection.delete_many({"pdf_file_id": file_id, "user": current_user["username"]})
    return {"msg": "PDF deleted successfully."}

@app.get("/pdf-image")
async def get_pdf_image(file_id: str = Query(...), image: str = Query(...), current_user: dict = Depends(get_current_user)):
    # Find the PDF document and check ownership
    pdf_doc = await pdfs_collection.find_one({"_id": file_id, "owner": current_user["username"]})
    if not pdf_doc or "images" not in pdf_doc:
        return JSONResponse(status_code=404, content={"error": "PDF or image not found."})
    # Check if the requested image is in the PDF's image metadata
    if not any(img["filename"] == image for img in pdf_doc["images"]):
        return JSONResponse(status_code=404, content={"error": "Image not found for this PDF."})
    img_path = os.path.join(UPLOAD_DIR, image)
    if not os.path.exists(img_path):
        return JSONResponse(status_code=404, content={"error": "Image file not found on server."})
    return FileResponse(img_path, media_type="image/png")
