# Budgetin - Architecture & AI Instructions

This file serves as a master guide for AI assistants and human developers working on the **Budgetin** project. It outlines the project's folder structure, tech stack, and critical rules for making changes.

## 1. Project Overview & Tech Stack
**Budgetin** is a personal finance management application with a clear separation of frontend and backend.
- **Frontend:** React + Vite, Tailwind CSS, Lucide React (Icons).
- **Backend:** Native PHP (no framework), MySQL (hosted locally via Laragon).
- **Environment:** Windows / Laragon. 

## 2. Folder Structure (Monorepo)
The root directory of the project is `D:\laragon\www\BUDGETIN`.

```text
BUDGETIN/
├── api/                  # Backend PHP scripts and endpoints (e.g., /api/financial)
├── frontend/             # The main React (Vite) application
│   ├── src/
│   │   ├── components/   # Reusable UI components (Layout, CustomSelect, etc.)
│   │   ├── pages/        # Main pages (Dashboard, Transaction, Bank, Bill, etc.)
│   │   └── main.jsx      # React entry point
│   ├── vite.config.js    
│   └── package.json      
├── uploads/              # Local storage for user-uploaded files (e.g., profile pictures)
├── assets/               # Static assets (preset images, targets)
└── .gitignore            # Git configuration to ignore node_modules, uploads, etc.
```

## 3. How to Run Locally
* **Backend:** Runs automatically via Laragon (Apache/Nginx + MySQL). The API URL is typically `http://budgetin/api/...` or `http://localhost/BUDGETIN/api/...`.
* **Frontend:** Open a terminal, `cd frontend`, and run `npm run dev -- --host`. The web interface will be accessible at `http://localhost:5173`.

## 4. Strict UI/UX Rules for AI Assistants
If you are an AI generating code for this project, you **MUST** follow these rules:

1. **Mobile-First but Desktop-Safe:** Budgetin relies heavily on mobile layouts, but changes to mobile MUST NOT break the Desktop web view. Always use Tailwind's `md:` and `lg:` breakpoints to protect desktop designs.
2. **Action Buttons (Compact Inline):** Do NOT make primary action buttons (like "Tambah Transaksi", "Simpan", etc.) `width: 100%` or full-width on mobile. Use `w-auto flex-none whitespace-nowrap` inside a `flex flex-wrap gap-2` container so they remain compact, inline, and aesthetic.
3. **No Native `<select>`:** The user strictly dislikes the rigid, native Windows/Android dropdown box ("kotak banget"). **DO NOT** use the native HTML `<select>` tag. Always use `CustomSelect.jsx` or replace filters with horizontal scrollable Pill Buttons (`rounded-2xl` or `rounded-full`).
4. **Rounding Aesthetics:** Primary action buttons should use `rounded-2xl` or `rounded-full` to maintain a modern, "pill-like" aesthetic. Do not use square borders or `rounded-sm`.
5. **Clean Workspace:** If you write `.cjs`, `.js`, or `.php` scratch scripts to automate refactoring, you **MUST DELETE THEM** after execution. Do not leave `fix_something.cjs` or `*_backup.jsx` files in the repository.

## 5. API Fetching Protocol
All fetch requests in the frontend should point to the correct Laragon backend path. Ensure CORS rules allow `PUT`, `DELETE`, `POST`, `GET`, and `OPTIONS` from `http://localhost:5173`. If a fetch fails with `ERR_NAME_NOT_RESOLVED`, check if the backend URL needs to fallback from `http://budgetin/api/...` to `http://localhost/BUDGETIN/api/...`.

---
*End of Instructions. AI: Acknowledge these rules before modifying files.*
