# SteanoAsist Shorthand OCR — React + Flask

## Architecture
```
frontend/          → React app (Vite)
  src/App.jsx      → Main app with auth, routing, theme
  src/App.css      → Dark/light theme with CSS variables

backend/           → Flask API
  app.py           → Auth, decode, history, AI auto-correct
  models/          → Put your .pth and .json model files here
  pitman.db        → SQLite database (auto-created)
```

## Quick Start

### 1. Backend Setup
```bash
cd backend
pip install -r requirements.txt

# Copy your model files
mkdir -p models
cp /path/to/symbol_model_best.pth models/
cp /path/to/idx_to_label.json models/

# Run
python app.py
# → http://localhost:5000
```

### 2. Frontend Setup
```bash
# Create React app with Vite
npm create vite@latest frontend -- --template react
cd frontend
# Replace src/App.jsx and src/App.css with the provided files
npm install
npm run dev
# → http://localhost:5173
```

## Features
- **Auth**: Email + password, JWT tokens, 30-day sessions
- **Decode**: Sentence, paragraph, single symbol
- **AI Auto-Correct**: Groq/Gemini integration
- **History**: All decodes saved, searchable, deletable
- **Stats**: Total decodes, symbols processed, avg confidence
- **Theme**: Dark/light toggle, persists per user
- **Responsive**: Works on mobile (sidebar collapses)
- **Export PDF**: Download decode results as professionally formatted PDF reports

## API Endpoints
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/register | No | Create account |
| POST | /api/auth/login | No | Login |
| GET | /api/auth/me | Yes | Get user info |
| PUT | /api/auth/settings | Yes | Update theme/API key |
| POST | /api/decode/sentence | Yes | Decode sentence image |
| POST | /api/decode/paragraph | Yes | Decode paragraph image |
| POST | /api/decode/symbol | Yes | Decode single symbol |
| GET | /api/history | Yes | Get decode history |
| GET | /api/history/stats | Yes | Get user stats |
| DELETE | /api/history/:id | Yes | Delete history item |
| GET | /api/export/pdf/:id | Yes | Export decode result as PDF |
