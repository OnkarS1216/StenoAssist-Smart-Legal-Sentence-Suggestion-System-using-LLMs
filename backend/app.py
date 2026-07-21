"""
Pitman Shorthand OCR — Flask API Backend
Features: Auth, History, Symbol/Sentence/Paragraph decoding, AI Auto-Correct
"""

import os
from dotenv import load_dotenv
load_dotenv()  # Load .env file before any os.environ.get() calls

import sys
import json
import time
import uuid
import hashlib
import sqlite3
import base64
from datetime import datetime, timedelta
from functools import wraps
from io import BytesIO

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib.colors import HexColor, Color
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Image as RLImage,
    Table, TableStyle, HRFlowable, KeepTogether, Flowable
)
from reportlab.lib import colors
from reportlab.graphics.shapes import Drawing, Rect, Circle, String
from reportlab.graphics import renderPDF

import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import timm
import requests
from flask import Flask, request, jsonify, g, send_file
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import jwt

# =====================================================================
# CONFIG
# =====================================================================
app = Flask(__name__)
CORS(app, supports_credentials=True)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'change-me-in-env')
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['DB_PATH'] = 'pitman.db'
app.config['MODEL_DIR'] = os.environ.get('MODEL_DIR', 'models')

# Default AI provider — Groq is used when user hasn't configured their own
DEFAULT_AI_PROVIDER = 'groq'
DEFAULT_GROQ_API_KEY = os.environ.get('GROQ_API_KEY', '')

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# =====================================================================
# DATABASE
# =====================================================================
def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(app.config['DB_PATH'])
        g.db.row_factory = sqlite3.Row
    return g.db

@app.teardown_appcontext
def close_db(exception):
    db = g.pop('db', None)
    if db: db.close()

def init_db():
    db = sqlite3.connect(app.config['DB_PATH'])
    db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            theme TEXT DEFAULT 'dark',
            api_provider TEXT DEFAULT '',
            api_key_encrypted TEXT DEFAULT '',
            onboarding_done INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS history (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            type TEXT NOT NULL,
            filename TEXT,
            raw_text TEXT,
            corrected_text TEXT,
            meaning_text TEXT DEFAULT '',
            confidence REAL,
            num_symbols INTEGER,
            category TEXT DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            image_b64 TEXT,
            symbols_json TEXT DEFAULT '',
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_history_user ON history(user_id);
        CREATE INDEX IF NOT EXISTS idx_history_date ON history(created_at DESC);
    """)
    db.close()

init_db()

# Migrate: add meaning_text column if missing (for existing databases)
def _migrate_db():
    db = sqlite3.connect(app.config['DB_PATH'])
    cursor = db.execute("PRAGMA table_info(history)")
    columns = [row[1] for row in cursor.fetchall()]
    if 'meaning_text' not in columns:
        db.execute("ALTER TABLE history ADD COLUMN meaning_text TEXT DEFAULT ''")
        db.commit()
        print("Migration: added meaning_text column to history table")
    # Migrate users table: add onboarding_done if missing
    cursor2 = db.execute("PRAGMA table_info(users)")
    user_columns = [row[1] for row in cursor2.fetchall()]
    if 'onboarding_done' not in user_columns:
        db.execute("ALTER TABLE users ADD COLUMN onboarding_done INTEGER DEFAULT 0")
        db.commit()
        print("Migration: added onboarding_done column to users table")
    # Migrate history table: add symbols_json if missing
    cursor3 = db.execute("PRAGMA table_info(history)")
    history_columns = [row[1] for row in cursor3.fetchall()]
    if 'symbols_json' not in history_columns:
        db.execute("ALTER TABLE history ADD COLUMN symbols_json TEXT DEFAULT ''")
        db.commit()
        print("Migration: added symbols_json column to history table")
    db.close()

_migrate_db()

# =====================================================================
# AUTH
# =====================================================================
def create_token(user_id):
    return jwt.encode({
        'user_id': user_id,
        'exp': datetime.utcnow() + timedelta(days=30)
    }, app.config['SECRET_KEY'], algorithm='HS256')

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        if not token:
            return jsonify({'error': 'Token required'}), 401
        try:
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
            db = get_db()
            user = db.execute('SELECT * FROM users WHERE id = ?', (data['user_id'],)).fetchone()
            if not user:
                return jsonify({'error': 'User not found'}), 401
            g.user = dict(user)
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401
        return f(*args, **kwargs)
    return decorated

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.json
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    name = data.get('name', '').strip()

    if not email or not password:
        return jsonify({'error': 'Email and password required'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400

    db = get_db()
    existing = db.execute('SELECT id FROM users WHERE email = ?', (email,)).fetchone()
    if existing:
        return jsonify({'error': 'Email already registered'}), 409

    user_id = str(uuid.uuid4())
    db.execute('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)',
               (user_id, email, generate_password_hash(password), name or email.split('@')[0]))
    db.commit()

    token = create_token(user_id)
    return jsonify({'token': token, 'user': {'id': user_id, 'email': email, 'name': name, 'onboarding_done': False}})

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    db = get_db()
    user = db.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
    if not user or not check_password_hash(user['password_hash'], password):
        return jsonify({'error': 'Invalid email or password'}), 401

    token = create_token(user['id'])
    return jsonify({
        'token': token,
        'user': {'id': user['id'], 'email': user['email'], 'name': user['name'], 'theme': user['theme'], 'onboarding_done': bool(user['onboarding_done'])}
    })

@app.route('/api/auth/me', methods=['GET'])
@token_required
def get_me():
    u = g.user
    return jsonify({'id': u['id'], 'email': u['email'], 'name': u['name'], 'theme': u['theme'], 'onboarding_done': bool(u.get('onboarding_done', 0))})

@app.route('/api/auth/settings', methods=['PUT'])
@token_required
def update_settings():
    data = request.json
    db = get_db()
    if 'theme' in data:
        db.execute('UPDATE users SET theme = ? WHERE id = ?', (data['theme'], g.user['id']))
    if 'name' in data:
        db.execute('UPDATE users SET name = ? WHERE id = ?', (data['name'], g.user['id']))
    if 'api_provider' in data:
        db.execute('UPDATE users SET api_provider = ? WHERE id = ?', (data['api_provider'], g.user['id']))
    if 'api_key' in data:
        db.execute('UPDATE users SET api_key_encrypted = ? WHERE id = ?', (data['api_key'], g.user['id']))
    if 'password' in data and data['password']:
        if len(data['password']) < 6:
            return jsonify({'error': 'Password must be at least 6 characters'}), 400
        db.execute('UPDATE users SET password_hash = ? WHERE id = ?',
                   (generate_password_hash(data['password']), g.user['id']))
    if 'onboarding_done' in data:
        db.execute('UPDATE users SET onboarding_done = ? WHERE id = ?',
                   (1 if data['onboarding_done'] else 0, g.user['id']))
    db.commit()
    return jsonify({'success': True})

# =====================================================================
# MODEL LOADING
# =====================================================================
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
models = {}

class SymbolClassifier(nn.Module):
    def __init__(self, num_classes, dropout=0.4, backbone='efficientnet_b0'):
        super().__init__()
        self.backbone = timm.create_model(backbone, pretrained=False, num_classes=0, in_chans=3)
        with torch.no_grad():
            feat_dim = self.backbone(torch.randn(1, 3, 64, 128)).shape[1]
        self.classifier = nn.Sequential(
            nn.BatchNorm1d(feat_dim), nn.Dropout(dropout),
            nn.Linear(feat_dim, 1024), nn.GELU(),
            nn.BatchNorm1d(1024), nn.Dropout(dropout * 0.5),
            nn.Linear(1024, num_classes))
    def forward(self, x):
        return self.classifier(self.backbone(x))

def load_models():
    model_dir = app.config['MODEL_DIR']
    label_path = os.path.join(model_dir, 'idx_to_label.json')
    model_path = os.path.join(model_dir, 'symbol_model_best.pth')

    if not os.path.exists(label_path) or not os.path.exists(model_path):
        print(f"WARNING: Model files not found in {model_dir}")
        return

    with open(label_path) as f:
        idx_to_label = {int(k): v for k, v in json.load(f).items()}
    # Dual key support
    for k, v in list(idx_to_label.items()):
        idx_to_label[str(k)] = v

    model = SymbolClassifier(num_classes=len([k for k in idx_to_label if isinstance(k, int)]), dropout=0.4)
    ckpt = torch.load(model_path, map_location=device, weights_only=False)
    model.load_state_dict(ckpt['model_state_dict'])
    model.to(device).eval()

    models['classifier'] = model
    models['idx_to_label'] = idx_to_label
    models['num_classes'] = len([k for k in idx_to_label if isinstance(k, int)])
    print(f"Model loaded: {models['num_classes']} classes on {device}")

load_models()

# =====================================================================
# RECOGNITION FUNCTIONS
# =====================================================================
def recognize_symbol_img(sym_img):
    """Recognize a single symbol — exact training preprocessing."""
    if models.get('classifier') is None:
        return [('model_not_loaded', 0.0)]

    binary = cv2.adaptiveThreshold(sym_img, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                    cv2.THRESH_BINARY_INV, 11, 5)
    coords = cv2.findNonZero(binary)
    if coords is not None:
        x, y, w, h = cv2.boundingRect(coords)
        p = 5
        binary = binary[max(0,y-p):y+h+p, max(0,x-p):x+w+p]
    h, w = binary.shape
    if h == 0 or w == 0:
        return [('?', 0.0)]
    scale = min(64/h, 128/w)
    nh, nw = int(h*scale), int(w*scale)
    resized = cv2.resize(binary, (nw, nh))
    result = np.zeros((64, 128), dtype=np.uint8)
    yy, xx = (64-nh)//2, (128-nw)//2
    result[yy:yy+nh, xx:xx+nw] = resized

    img_3ch = np.stack([result]*3, axis=-1).astype(np.float32) / 255.0
    img_3ch = (img_3ch - 0.5) / 0.5
    tensor = torch.from_numpy(img_3ch).permute(2, 0, 1).unsqueeze(0).to(device)

    with torch.no_grad():
        logits = models['classifier'](tensor)
        probs = F.softmax(logits, dim=-1)
        top_probs, top_idx = probs.topk(5, dim=-1)

    idx_to_label = models['idx_to_label']
    return [(idx_to_label.get(idx.item(), idx_to_label.get(str(idx.item()), '?')), prob.item())
            for idx, prob in zip(top_idx[0], top_probs[0])]


def segment_sentence(img, min_gap=10):
    """Segment sentence image — exact training method."""
    if len(img.shape) == 3:
        img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    binary = cv2.adaptiveThreshold(img, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                    cv2.THRESH_BINARY_INV, 11, 5)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 1))
    connected = cv2.dilate(binary, kernel, iterations=1)
    v_proj = np.sum(connected, axis=0)
    threshold = v_proj.max() * 0.02
    is_ink = v_proj > threshold
    segments = []
    in_sym, start = False, 0
    for x in range(len(is_ink)):
        if is_ink[x] and not in_sym: start = x; in_sym = True
        elif not is_ink[x] and in_sym:
            if segments and (start - segments[-1][1]) < min_gap:
                segments[-1] = (segments[-1][0], x)
            else: segments.append((start, x))
            in_sym = False
    if in_sym:
        if segments and (start - segments[-1][1]) < min_gap:
            segments[-1] = (segments[-1][0], len(is_ink))
        else: segments.append((start, len(is_ink)))
    return [img[:, max(0,x1-3):min(img.shape[1],x2+3)] for x1, x2 in segments if x2-x1 > 5]


def segment_paragraph(page_img, min_gap=10):
    """Segment multi-line paragraph — line-by-line."""
    gray = page_img if len(page_img.shape) == 2 else cv2.cvtColor(page_img, cv2.COLOR_BGR2GRAY)
    binary = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                    cv2.THRESH_BINARY_INV, 11, 5)
    h_proj = np.sum(binary, axis=1)
    h_thresh = h_proj.max() * 0.02 if h_proj.max() > 0 else 0
    lines, in_l, st = [], False, 0
    for y in range(len(h_proj)):
        if h_proj[y] > h_thresh and not in_l: st = y; in_l = True
        elif h_proj[y] <= h_thresh and in_l:
            if y - st > 8: lines.append((st, y))
            in_l = False
    if in_l and len(h_proj) - st > 8: lines.append((st, len(h_proj)))
    merged = []
    for s, e in lines:
        if merged and (s - merged[-1][1]) < 10: merged[-1] = (merged[-1][0], e)
        else: merged.append((s, e))

    all_symbols, line_info = [], []
    for lt, lb in merged:
        line_img = gray[lt:lb, :]
        line_syms = segment_sentence(line_img, min_gap=min_gap)
        line_info.append({'top': lt, 'bottom': lb, 'symbols': len(line_syms)})
        all_symbols.extend(line_syms)
    return all_symbols, line_info


# =====================================================================
# AI AUTO-CORRECT
# =====================================================================
def get_ai_config(user):
    """Resolve AI provider and key — user override or system default."""
    user_provider = (user.get('api_provider') or '').strip()
    user_key = (user.get('api_key_encrypted') or '').strip()

    if user_provider and user_key:
        return user_provider, user_key

    # Fall back to system-default Groq
    return DEFAULT_AI_PROVIDER, DEFAULT_GROQ_API_KEY


def _call_llm(prompt, provider, api_key, max_tokens=1024, temperature=0.2):
    """Generic helper to call the configured LLM provider."""
    try:
        if 'groq' in provider.lower():
            resp = requests.post("https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"model": "llama-3.3-70b-versatile", "messages": [{"role": "user", "content": prompt}],
                      "max_tokens": max_tokens, "temperature": temperature}, timeout=15)
            if resp.status_code == 200:
                return resp.json()['choices'][0]['message']['content'].strip()

        elif 'gemini' in provider.lower():
            resp = requests.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}",
                json={"contents": [{"parts": [{"text": prompt}]}],
                      "generationConfig": {"temperature": temperature, "maxOutputTokens": max_tokens}}, timeout=15)
            if resp.status_code == 200:
                return resp.json()['candidates'][0]['content']['parts'][0]['text'].strip()

        elif 'openai' in provider.lower():
            resp = requests.post("https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"model": "gpt-4o-mini", "messages": [{"role": "user", "content": prompt}],
                      "max_tokens": max_tokens, "temperature": temperature}, timeout=15)
            if resp.status_code == 200:
                return resp.json()['choices'][0]['message']['content'].strip()

    except Exception as e:
        print(f"AI error: {e}")
    return None


def ai_auto_correct(raw_text, word_confs, provider, api_key):
    """Use LLM to fix OCR errors — returns only the concise corrected text."""
    conf_str = ' '.join(f"{w}({'OK' if c > 0.7 else 'MED' if c > 0.3 else 'LOW'},{c:.0%})"
                        for w, c in word_confs)

    prompt = f"""Fix this OCR-decoded Pitman shorthand text. Output ONLY the corrected text — nothing else.

RAW TEXT: "{raw_text}"
WORD CONFIDENCE: {conf_str}

Rules:
1. Fix spelling errors, especially LOW confidence words, using surrounding context.
2. Add proper punctuation (full stops, commas, etc.) where grammatically needed.
3. Keep the original words as much as possible — only fix obvious OCR errors.
4. This is from an Indian legal/court document — use appropriate legal terms.

IMPORTANT: Reply with ONLY the corrected sentence/paragraph. Do NOT include any explanation, definition, meaning, notes, commentary, or extra text. Just the corrected version and nothing else."""

    return _call_llm(prompt, provider, api_key)


def ai_generate_meaning(corrected_text, raw_text, provider, api_key):
    """Use LLM to generate a detailed meaning and explanation of the corrected text."""
    prompt = f"""You are an expert in legal and professional document analysis. Below is a corrected transcription of Pitman shorthand text from an Indian court or legal document.

CORRECTED TEXT: "{corrected_text}"
ORIGINAL RAW TEXT: "{raw_text}"

Your task:
1. Provide a detailed explanation of what this text means in plain, easy-to-understand language.
2. Explain any legal terms, technical phrases, or domain-specific vocabulary used.
3. Describe the context and purpose of the statement — is it a court order, testimony, legal argument, correspondence, etc.?
4. If there are any implied actions, obligations, or consequences mentioned, explain them clearly.
5. Keep the explanation well-structured with clear paragraphs.
6. Write in a helpful, informative tone suitable for someone who may not have legal expertise.

Provide ONLY the meaning and explanation. No headers like "Meaning:" or "Explanation:". Just start directly with the explanation."""

    return _call_llm(prompt, provider, api_key, max_tokens=2048, temperature=0.3)


# =====================================================================
# API ROUTES
# =====================================================================
@app.route('/api/status', methods=['GET'])
def status():
    return jsonify({
        'model_loaded': models.get('classifier') is not None,
        'num_classes': models.get('num_classes', 0),
        'device': str(device),
    })

@app.route('/api/decode/sentence', methods=['POST'])
@token_required
def decode_sentence():
    if 'image' not in request.files:
        return jsonify({'error': 'No image uploaded'}), 400

    file = request.files['image']
    file_bytes = np.frombuffer(file.read(), np.uint8)
    img = cv2.imdecode(file_bytes, cv2.IMREAD_GRAYSCALE)
    if img is None:
        return jsonify({'error': 'Invalid image'}), 400

    min_gap = request.form.get('min_gap', 10, type=int)
    symbols = segment_sentence(img, min_gap=min_gap)

    results = []
    for sym in symbols:
        preds = recognize_symbol_img(sym)
        _, buf = cv2.imencode('.png', sym)
        results.append({
            'word': preds[0][0],
            'confidence': round(preds[0][1], 4),
            'top_k': [{'word': w, 'confidence': round(c, 4)} for w, c in preds],
            'image_b64': base64.b64encode(buf).decode('utf-8'),
        })

    raw_text = ' '.join(r['word'] for r in results)

    # AI auto-correct (always runs — uses default Groq if user hasn't set a provider)
    corrected_text = raw_text
    meaning_text = ''
    user = g.user
    provider, api_key = get_ai_config(user)
    if provider and api_key:
        word_confs = [(r['word'], r['confidence']) for r in results]
        corrected = ai_auto_correct(raw_text, word_confs, provider, api_key)
        if corrected:
            corrected_text = corrected
        # Generate detailed meaning/explanation
        meaning = ai_generate_meaning(corrected_text, raw_text, provider, api_key)
        if meaning:
            meaning_text = meaning

    # Save to history
    _, img_buf = cv2.imencode('.png', img)
    img_b64 = base64.b64encode(img_buf).decode('utf-8')

    history_id = str(uuid.uuid4())
    db = get_db()
    # Serialize symbol data for later retrieval
    symbols_json = json.dumps([{'word': r['word'], 'confidence': r['confidence'], 'image_b64': r['image_b64']} for r in results])
    db.execute('''INSERT INTO history (id, user_id, type, filename, raw_text, corrected_text,
                  meaning_text, confidence, num_symbols, image_b64, symbols_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)''',
               (history_id, user['id'], 'sentence', file.filename, raw_text, corrected_text,
                meaning_text,
                round(np.mean([r['confidence'] for r in results]), 4) if results else 0,
                len(results), img_b64, symbols_json))
    db.commit()

    return jsonify({
        'id': history_id,
        'raw_text': raw_text,
        'corrected_text': corrected_text,
        'meaning_text': meaning_text,
        'num_symbols': len(results),
        'avg_confidence': round(np.mean([r['confidence'] for r in results]), 4) if results else 0,
        'symbols': results,
    })


@app.route('/api/decode/paragraph', methods=['POST'])
@token_required
def decode_paragraph():
    if 'image' not in request.files:
        return jsonify({'error': 'No image uploaded'}), 400

    file = request.files['image']
    file_bytes = np.frombuffer(file.read(), np.uint8)
    img = cv2.imdecode(file_bytes, cv2.IMREAD_GRAYSCALE)
    if img is None:
        return jsonify({'error': 'Invalid image'}), 400

    min_gap = request.form.get('min_gap', 10, type=int)
    symbols, line_info = segment_paragraph(img, min_gap=min_gap)

    results = []
    for sym in symbols:
        preds = recognize_symbol_img(sym)
        _, buf = cv2.imencode('.png', sym)
        results.append({
            'word': preds[0][0],
            'confidence': round(preds[0][1], 4),
            'top_k': [{'word': w, 'confidence': round(c, 4)} for w, c in preds],
            'image_b64': base64.b64encode(buf).decode('utf-8'),
        })

    raw_text = ' '.join(r['word'] for r in results)

    # AI auto-correct (always runs — uses default Groq if user hasn't set a provider)
    corrected_text = raw_text
    meaning_text = ''
    user = g.user
    provider, api_key = get_ai_config(user)
    if provider and api_key:
        word_confs = [(r['word'], r['confidence']) for r in results]
        corrected = ai_auto_correct(raw_text, word_confs, provider, api_key)
        if corrected:
            corrected_text = corrected
        # Generate detailed meaning/explanation
        meaning = ai_generate_meaning(corrected_text, raw_text, provider, api_key)
        if meaning:
            meaning_text = meaning

    # Save to history
    _, img_buf = cv2.imencode('.png', img)
    img_b64 = base64.b64encode(img_buf).decode('utf-8')

    history_id = str(uuid.uuid4())
    db = get_db()
    # Serialize symbol data for later retrieval
    symbols_json = json.dumps([{'word': r['word'], 'confidence': r['confidence'], 'image_b64': r['image_b64']} for r in results])
    db.execute('''INSERT INTO history (id, user_id, type, filename, raw_text, corrected_text,
                  meaning_text, confidence, num_symbols, image_b64, symbols_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)''',
               (history_id, user['id'], 'paragraph', file.filename, raw_text, corrected_text,
                meaning_text,
                round(np.mean([r['confidence'] for r in results]), 4) if results else 0,
                len(results), img_b64, symbols_json))
    db.commit()

    return jsonify({
        'id': history_id,
        'raw_text': raw_text,
        'corrected_text': corrected_text,
        'meaning_text': meaning_text,
        'num_symbols': len(results),
        'num_lines': len(line_info),
        'lines': line_info,
        'avg_confidence': round(np.mean([r['confidence'] for r in results]), 4) if results else 0,
        'symbols': results,
    })


@app.route('/api/decode/symbol', methods=['POST'])
@token_required
def decode_symbol():
    if 'image' not in request.files:
        return jsonify({'error': 'No image uploaded'}), 400

    file = request.files['image']
    file_bytes = np.frombuffer(file.read(), np.uint8)
    img = cv2.imdecode(file_bytes, cv2.IMREAD_GRAYSCALE)
    if img is None:
        return jsonify({'error': 'Invalid image'}), 400

    preds = recognize_symbol_img(img)
    return jsonify({
        'predictions': [{'word': w, 'confidence': round(c, 4)} for w, c in preds],
    })


# =====================================================================
# HISTORY
# =====================================================================
@app.route('/api/history', methods=['GET'])
@token_required
def get_history():
    db = get_db()
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    type_filter = request.args.get('type', '')

    query = 'SELECT id, type, filename, raw_text, corrected_text, meaning_text, confidence, num_symbols, created_at FROM history WHERE user_id = ?'
    params = [g.user['id']]
    if type_filter:
        query += ' AND type = ?'
        params.append(type_filter)
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
    params.extend([per_page, (page - 1) * per_page])

    rows = db.execute(query, params).fetchall()
    total = db.execute('SELECT COUNT(*) FROM history WHERE user_id = ?', (g.user['id'],)).fetchone()[0]

    return jsonify({
        'items': [dict(r) for r in rows],
        'total': total,
        'page': page,
        'pages': (total + per_page - 1) // per_page,
    })

@app.route('/api/history/<history_id>', methods=['GET'])
@token_required
def get_history_item(history_id):
    db = get_db()
    item = db.execute('SELECT * FROM history WHERE id = ? AND user_id = ?',
                      (history_id, g.user['id'])).fetchone()
    if not item:
        return jsonify({'error': 'Not found'}), 404
    result = dict(item)
    # Parse symbols_json back into a list for the frontend
    symbols_raw = result.pop('symbols_json', '') or ''
    if symbols_raw:
        try:
            result['symbols'] = json.loads(symbols_raw)
        except (json.JSONDecodeError, TypeError):
            result['symbols'] = []
    else:
        result['symbols'] = []
    return jsonify(result)

@app.route('/api/history/<history_id>', methods=['DELETE'])
@token_required
def delete_history_item(history_id):
    db = get_db()
    db.execute('DELETE FROM history WHERE id = ? AND user_id = ?', (history_id, g.user['id']))
    db.commit()
    return jsonify({'success': True})

@app.route('/api/history/stats', methods=['GET'])
@token_required
def get_stats():
    db = get_db()
    uid = g.user['id']
    total = db.execute('SELECT COUNT(*) FROM history WHERE user_id = ?', (uid,)).fetchone()[0]
    sentences = db.execute("SELECT COUNT(*) FROM history WHERE user_id = ? AND type = 'sentence'", (uid,)).fetchone()[0]
    paragraphs = db.execute("SELECT COUNT(*) FROM history WHERE user_id = ? AND type = 'paragraph'", (uid,)).fetchone()[0]
    avg_conf = db.execute('SELECT AVG(confidence) FROM history WHERE user_id = ?', (uid,)).fetchone()[0] or 0
    total_syms = db.execute('SELECT SUM(num_symbols) FROM history WHERE user_id = ?', (uid,)).fetchone()[0] or 0

    return jsonify({
        'total_decodes': total,
        'sentences': sentences,
        'paragraphs': paragraphs,
        'avg_confidence': round(avg_conf, 3),
        'total_symbols': total_syms,
    })


# =====================================================================
# PDF EXPORT — OFFICIAL JUDICIAL DOCUMENT THEME
# =====================================================================

class DoubleRule(Flowable):
    """A formal double-line rule used in legal documents."""
    def __init__(self, width, weight=0.75, gap=2):
        Flowable.__init__(self)
        self.rule_width = width
        self.weight = weight
        self.gap = gap
        self.width = width
        self.height = weight * 2 + gap

    def draw(self):
        c = self.canv
        c.setStrokeColor(HexColor('#1a1a1a'))
        c.setLineWidth(self.weight)
        c.line(0, self.height, self.rule_width, self.height)
        c.setLineWidth(self.weight * 0.5)
        c.line(0, 0, self.rule_width, 0)


class SingleRule(Flowable):
    """A thin single rule for section separation."""
    def __init__(self, width, color=None):
        Flowable.__init__(self)
        self.rule_width = width
        self.rule_color = color or HexColor('#999999')
        self.width = width
        self.height = 0.5

    def draw(self):
        c = self.canv
        c.setStrokeColor(self.rule_color)
        c.setLineWidth(0.5)
        c.line(0, 0, self.rule_width, 0)


def _judicial_page(canvas, doc):
    """Draw formal judicial page decorations — clean, no dark backgrounds."""
    w, h = A4
    margin = 2 * cm
    canvas.saveState()

    # Double-line border at top
    canvas.setStrokeColor(HexColor('#1a1a1a'))
    canvas.setLineWidth(1.2)
    canvas.line(margin, h - 28, w - margin, h - 28)
    canvas.setLineWidth(0.4)
    canvas.line(margin, h - 31, w - margin, h - 31)

    # Header — centered, formal
    canvas.setFillColor(HexColor('#1a1a1a'))
    canvas.setFont('Times-Bold', 14)
    canvas.drawCentredString(w / 2, h - 22, 'OFFICIAL TRANSCRIPT')

    # Subtle decorative elements on header line
    canvas.setFont('Times-Roman', 7)
    canvas.setFillColor(HexColor('#666666'))
    canvas.drawString(margin, h - 22, '\u2696')  # Scales of justice
    canvas.drawRightString(w - margin, h - 22, '\u2696')

    # Double-line border at bottom
    footer_y = 30
    canvas.setStrokeColor(HexColor('#1a1a1a'))
    canvas.setLineWidth(0.4)
    canvas.line(margin, footer_y + 3, w - margin, footer_y + 3)
    canvas.setLineWidth(1.2)
    canvas.line(margin, footer_y, w - margin, footer_y)

    # Footer text
    canvas.setFillColor(HexColor('#666666'))
    canvas.setFont('Times-Roman', 7)
    canvas.drawString(margin, footer_y - 12,
                      'This is a computer-generated transcript. Verify with original shorthand records.')

    canvas.setFont('Times-Roman', 7)
    canvas.drawRightString(w - margin, footer_y - 12, f'Page {doc.page}')

    # Thin vertical margin lines (subtle legal feel)
    canvas.setStrokeColor(HexColor('#e0e0e0'))
    canvas.setLineWidth(0.3)
    canvas.line(margin - 4, h - 34, margin - 4, footer_y + 6)
    canvas.line(w - margin + 4, h - 34, w - margin + 4, footer_y + 6)

    canvas.restoreState()


@app.route('/api/export/pdf/<history_id>', methods=['GET'])
@token_required
def export_pdf(history_id):
    db = get_db()
    item = db.execute('SELECT * FROM history WHERE id = ? AND user_id = ?',
                      (history_id, g.user['id'])).fetchone()
    if not item:
        return jsonify({'error': 'Not found'}), 404

    item = dict(item)
    buf = BytesIO()

    # --- Formal colour palette ---
    BLACK       = HexColor('#1a1a1a')
    DARK_GRAY   = HexColor('#333333')
    MED_GRAY    = HexColor('#666666')
    LIGHT_GRAY  = HexColor('#999999')
    BORDER      = HexColor('#cccccc')
    LIGHT_BG    = HexColor('#f9f9f8')
    WHITE       = HexColor('#ffffff')

    page_w, page_h = A4
    content_w = page_w - 4 * cm

    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        topMargin=50, bottomMargin=50,
        leftMargin=2 * cm, rightMargin=2 * cm,
        title='Official Transcript — Shorthand Decode Report',
        author='Court Stenography Division',
    )

    # --- Formal legal styles (serif fonts) ---
    styles = getSampleStyleSheet()

    styles.add(ParagraphStyle('DocTitle', fontName='Times-Bold', fontSize=16,
                              textColor=BLACK, alignment=TA_CENTER,
                              spaceBefore=4 * mm, spaceAfter=2 * mm))
    styles.add(ParagraphStyle('DocSubtitle', fontName='Times-Roman', fontSize=10,
                              textColor=MED_GRAY, alignment=TA_CENTER,
                              spaceAfter=4 * mm))
    styles.add(ParagraphStyle('SectionHead', fontName='Times-Bold', fontSize=11,
                              textColor=BLACK, spaceBefore=5 * mm, spaceAfter=3 * mm))
    styles.add(ParagraphStyle('FieldLabel', fontName='Times-Bold', fontSize=8,
                              textColor=LIGHT_GRAY, spaceBefore=0, spaceAfter=0))
    styles.add(ParagraphStyle('FieldValue', fontName='Times-Roman', fontSize=10,
                              textColor=BLACK, spaceBefore=0.5 * mm, spaceAfter=0))
    styles.add(ParagraphStyle('BodySerif', fontName='Times-Roman', fontSize=11,
                              textColor=DARK_GRAY, leading=18, spaceAfter=2 * mm))
    styles.add(ParagraphStyle('BodySerifLarge', fontName='Times-Roman', fontSize=12,
                              textColor=BLACK, leading=20, spaceAfter=2 * mm))
    styles.add(ParagraphStyle('LegalNote', fontName='Times-Italic', fontSize=8,
                              textColor=LIGHT_GRAY, alignment=TA_CENTER,
                              spaceBefore=3 * mm))
    styles.add(ParagraphStyle('Timestamp', fontName='Times-Roman', fontSize=8,
                              textColor=LIGHT_GRAY, alignment=TA_CENTER,
                              spaceBefore=2 * mm))

    story = []

    # ───────────────────────────────────────────────────
    # DOCUMENT HEADER
    # ───────────────────────────────────────────────────
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph('SHORTHAND TRANSCRIPTION REPORT', styles['DocTitle']))

    # Parse metadata
    type_map = {'sentence': 'Sentence', 'paragraph': 'Document', 'symbol': 'Symbol'}
    decode_type = type_map.get(item.get('type', 'sentence'), (item.get('type') or 'sentence').capitalize())
    created = item.get('created_at', '')
    try:
        dt = datetime.fromisoformat(created)
        created_fmt = dt.strftime('%d %B %Y')
    except Exception:
        created_fmt = created
    # Use real-time IST for the Time field
    ist_now = datetime.utcnow() + timedelta(hours=5, minutes=30)
    created_time = ist_now.strftime('%I:%M %p') + ' IST'

    conf_val = float(item.get('confidence', 0))
    num_symbols = str(item.get('num_symbols', 0))
    filename = item.get('filename') or '\u2014'

    story.append(Paragraph(
        f'Dated: {created_fmt}  \u00b7  Reference No. {history_id[:12].upper()}',
        styles['DocSubtitle']
    ))

    story.append(DoubleRule(content_w))
    story.append(Spacer(1, 4 * mm))

    # ───────────────────────────────────────────────────
    # I. PARTICULARS
    # ───────────────────────────────────────────────────
    story.append(Paragraph('I. \u2003 PARTICULARS', styles['SectionHead']))

    # Formal metadata table
    meta_data = [
        ['Document Type', decode_type, 'Date of Transcription', created_fmt],
        ['Symbols Identified', num_symbols, 'Time', created_time or '\u2014'],
        ['Source File', filename[:35], 'Recognition Accuracy',
         f"{conf_val * 100:.1f}%"],
    ]

    meta_rows = []
    for row in meta_data:
        meta_rows.append([
            Paragraph(f'<font size="7" color="#999999"><b>{row[0].upper()}</b></font>',
                      styles['FieldLabel']),
            Paragraph(f'<font size="10">{row[1]}</font>', styles['FieldValue']),
            Paragraph(f'<font size="7" color="#999999"><b>{row[2].upper()}</b></font>',
                      styles['FieldLabel']),
            Paragraph(f'<font size="10">{row[3]}</font>', styles['FieldValue']),
        ])

    half_w = content_w / 2
    meta_table = Table(meta_rows,
                       colWidths=[half_w * 0.38, half_w * 0.62,
                                  half_w * 0.38, half_w * 0.62])
    meta_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LINEBELOW', (0, 0), (-1, -1), 0.3, BORDER),
        ('LINEAFTER', (1, 0), (1, -1), 0.3, BORDER),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 4 * mm))
    story.append(SingleRule(content_w))
    story.append(Spacer(1, 4 * mm))

    # ───────────────────────────────────────────────────
    # II. EXHIBIT — ORIGINAL SHORTHAND
    # ───────────────────────────────────────────────────
    img_b64 = item.get('image_b64')
    if img_b64:
        story.append(Paragraph('II. \u2003 EXHIBIT \u2014 ORIGINAL SHORTHAND', styles['SectionHead']))
        try:
            img_bytes = base64.b64decode(img_b64)
            img_buf_io = BytesIO(img_bytes)
            rl_img = RLImage(img_buf_io)
            max_w = content_w - 40
            max_h = 5.5 * cm
            iw, ih = rl_img.imageWidth, rl_img.imageHeight
            if iw > 0 and ih > 0:
                ratio = min(max_w / iw, max_h / ih, 1.0)
                rl_img.drawWidth = iw * ratio
                rl_img.drawHeight = ih * ratio
            rl_img.hAlign = 'CENTER'

            img_table = Table([[rl_img]], colWidths=[content_w])
            img_table.setStyle(TableStyle([
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('BACKGROUND', (0, 0), (-1, -1), WHITE),
                ('BOX', (0, 0), (-1, -1), 0.5, BORDER),
                ('TOPPADDING', (0, 0), (-1, -1), 14),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 14),
            ]))
            story.append(img_table)
        except Exception:
            story.append(Paragraph('<i>(Exhibit image could not be reproduced)</i>',
                                   styles['BodySerif']))
        story.append(Spacer(1, 4 * mm))
        story.append(SingleRule(content_w))
        story.append(Spacer(1, 4 * mm))

    # ───────────────────────────────────────────────────
    # III. TRANSCRIPTION
    # ───────────────────────────────────────────────────
    raw_text = item.get('raw_text') or ''
    corrected_text = item.get('corrected_text') or raw_text
    has_correction = raw_text and raw_text != corrected_text

    section_roman = 'III' if img_b64 else 'II'
    story.append(Paragraph(f'{section_roman}. \u2003 TRANSCRIPTION', styles['SectionHead']))

    # Helper: formal text block with label
    def _legal_block(label, text, font_size=11, bg=None, border_left_color=None):
        label_p = Paragraph(
            f'<font size="7" color="#999999"><b>{label}</b></font>',
            styles['FieldLabel']
        )
        text_p = Paragraph(
            f'<font size="{font_size}" color="#1a1a1a">{text}</font>',
            ParagraphStyle('_legalBody', fontName='Times-Roman',
                           fontSize=font_size, leading=font_size + 7,
                           textColor=BLACK, spaceBefore=2 * mm)
        )
        inner = Table([[label_p], [text_p]], colWidths=[content_w - 10])
        inner.setStyle(TableStyle([
            ('TOPPADDING', (0, 0), (-1, -1), 2),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
            ('LEFTPADDING', (0, 0), (-1, -1), 12),
            ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ]))

        tbl_style = [
            ('TOPPADDING', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('BOX', (0, 0), (-1, -1), 0.4, BORDER),
        ]
        if bg:
            tbl_style.append(('BACKGROUND', (0, 0), (-1, -1), bg))
        if border_left_color:
            tbl_style.append(('LINEBEFORE', (0, 0), (0, -1), 2.5, border_left_color))

        card = Table([[inner]], colWidths=[content_w])
        card.setStyle(TableStyle(tbl_style))
        return card

    # (a) Raw Decoded
    if has_correction:
        story.append(Paragraph(
            '<font size="9" color="#666666"><i>(a) Raw Machine Output</i></font>',
            styles['BodySerif']
        ))
        raw_block = _legal_block(
            'VERBATIM MACHINE OUTPUT',
            raw_text,
            font_size=10,
            bg=HexColor('#fafaf8'),
            border_left_color=HexColor('#cccccc')
        )
        story.append(raw_block)
        story.append(Spacer(1, 3 * mm))

        # (b) AI-Corrected
        story.append(Paragraph(
            '<font size="9" color="#666666"><i>(b) Corrected Transcription</i></font>',
            styles['BodySerif']
        ))
    corrected_block = _legal_block(
        'CORRECTED TRANSCRIPTION' if has_correction else 'TRANSCRIBED TEXT',
        corrected_text or raw_text,
        font_size=12,
        bg=WHITE,
        border_left_color=HexColor('#1a1a1a')
    )
    story.append(corrected_block)
    story.append(Spacer(1, 4 * mm))
    story.append(SingleRule(content_w))
    story.append(Spacer(1, 4 * mm))

    # ───────────────────────────────────────────────────
    # IV. ANALYSIS & INTERPRETATION
    # ───────────────────────────────────────────────────
    meaning_text = item.get('meaning_text') or ''
    next_roman = 'IV' if img_b64 else 'III'
    if meaning_text:
        story.append(Paragraph(
            f'{next_roman}. \u2003 ANALYSIS & INTERPRETATION', styles['SectionHead']
        ))
        story.append(Spacer(1, 2 * mm))
        story.append(Paragraph(
            f'<font size="7" color="#999999"><b>INTERPRETATION OF TRANSCRIBED TEXT</b></font>',
            styles['FieldLabel']
        ))
        story.append(Spacer(1, 1.5 * mm))
        story.append(Paragraph(
            meaning_text,
            ParagraphStyle('_meaningBody', fontName='Times-Roman',
                           fontSize=10, leading=17,
                           textColor=DARK_GRAY, spaceBefore=1 * mm, spaceAfter=2 * mm)
        ))
        story.append(Spacer(1, 4 * mm))
        story.append(SingleRule(content_w))
        story.append(Spacer(1, 4 * mm))

    # ───────────────────────────────────────────────────
    # CERTIFICATION / FOOTER
    # ───────────────────────────────────────────────────
    story.append(DoubleRule(content_w))
    story.append(Spacer(1, 3 * mm))

    story.append(Paragraph(
        'This transcript has been generated through automated shorthand recognition '
        'and AI-assisted correction. The accuracy of the transcription is subject to '
        'the quality of the original shorthand input. This document should be verified '
        'against original records before being used for official purposes.',
        styles['LegalNote']
    ))

    now_str = datetime.now().strftime('%d %B %Y, %I:%M %p')
    story.append(Paragraph(
        f'Generated on {now_str}  \u00b7  Ref. {history_id[:12].upper()}',
        styles['Timestamp']
    ))

    doc.build(story, onFirstPage=_judicial_page, onLaterPages=_judicial_page)
    buf.seek(0)

    safe_name = f"transcript_{history_id[:8]}.pdf"
    return send_file(buf, mimetype='application/pdf', as_attachment=True, download_name=safe_name)


# =====================================================================
# RUN
# =====================================================================
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
