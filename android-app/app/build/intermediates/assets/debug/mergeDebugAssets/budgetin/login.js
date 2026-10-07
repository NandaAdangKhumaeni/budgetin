// ========================================
// BUDGETIN LOCAL EMAIL AUTHENTICATION
// Data akun disimpan hanya di perangkat ini.
// ========================================

const ACCOUNT_STORAGE_KEY = "budgetin_accounts";
const SESSION_STORAGE_KEY = "budgetin_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;
let authMode = "login";

function readAccounts() {
    try {
        const accounts = JSON.parse(localStorage.getItem(ACCOUNT_STORAGE_KEY));
        return Array.isArray(accounts) ? accounts : [];
    } catch (error) {
        console.warn("Data akun tidak dapat dibaca.", error);
        return [];
    }
}

function setAuthMessage(message, isError = true) {
    const element = document.getElementById("authMessage");
    element.textContent = message;
    element.classList.toggle("is-error", isError);
    element.classList.toggle("is-success", !isError);
}

function clearAuthMessage() {
    setAuthMessage("", false);
}

function generateSalt() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password, salt) {
    if (!window.crypto?.subtle) {
        throw new Error("Perangkat ini tidak mendukung pengamanan password yang diperlukan.");
    }

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
    );
    const bits = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: encoder.encode(salt),
            iterations: 100000,
            hash: "SHA-256"
        },
        key,
        256
    );

    return Array.from(new Uint8Array(bits), byte =>
        byte.toString(16).padStart(2, "0")
    ).join("");
}

function saveSession(email, remember) {
    const session = JSON.stringify({
        email,
        expiresAt: Date.now() + SESSION_DURATION_MS
    });

    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(SESSION_STORAGE_KEY);

    (remember ? localStorage : sessionStorage)
        .setItem(SESSION_STORAGE_KEY, session);
}

function setAuthMode(mode) {
    authMode = mode;
    const isRegister = mode === "register";

    document.querySelectorAll(".auth-register-only").forEach(element => {
        element.hidden = !isRegister;
    });

    document.getElementById("authEyebrow").textContent = isRegister
        ? "Buat akun lokalmu"
        : "Selamat datang kembali 👋";
    document.getElementById("authTitle").textContent = isRegister
        ? "Daftar ke Budgetin"
        : "Masuk ke Budgetin";
    document.getElementById("authSubtitle").textContent = isRegister
        ? "Akun dan data keuangan tersimpan aman di perangkat ini."
        : "Masuk untuk melanjutkan catatan keuanganmu.";
    document.getElementById("authSubmitLabel").textContent = isRegister
        ? "Buat Akun"
        : "Masuk";
    document.getElementById("authSwitchText").textContent = isRegister
        ? "Sudah punya akun?"
        : "Belum punya akun?";
    document.getElementById("authSwitch").textContent = isRegister
        ? "Masuk sekarang"
        : "Daftar sekarang";
    document.getElementById("confirmPassword").required = isRegister;
    document.getElementById("forgotPasswordLink").hidden = isRegister;
    clearAuthMessage();
}

function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    input.type = input.type === "password" ? "text" : "password";
}

document.getElementById("authSwitch").addEventListener("click", event => {
    event.preventDefault();
    setAuthMode(authMode === "login" ? "register" : "login");
});

document.getElementById("forgotPasswordLink").addEventListener("click", event => {
    event.preventDefault();
    setAuthMessage("Versi offline belum mendukung reset password. Simpan password Anda dengan aman.");
});

document.getElementById("loginForm").addEventListener("submit", async event => {
    event.preventDefault();
    clearAuthMessage();

    const email = document.getElementById("loginEmail").value.trim().toLowerCase();
    const password = document.getElementById("loginPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;
    const remember = document.getElementById("rememberLogin").checked;

    if (!email || !password) {
        setAuthMessage("Email dan password wajib diisi.");
        return;
    }

    if (authMode === "register" && password.length < 8) {
        setAuthMessage("Password minimal terdiri dari 8 karakter.");
        return;
    }

    if (authMode === "register" && password !== confirmPassword) {
        setAuthMessage("Konfirmasi password belum sama.");
        return;
    }

    try {
        const accounts = readAccounts();
        const account = accounts.find(item => item.email === email);

        if (authMode === "register") {
            if (account) {
                setAuthMessage("Email ini sudah terdaftar. Silakan masuk.");
                return;
            }

            const salt = generateSalt();
            const passwordHash = await hashPassword(password, salt);
            accounts.push({ email, salt, passwordHash, createdAt: new Date().toISOString() });
            localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));
            saveSession(email, remember);
            window.location.replace("index.html");
            return;
        }

        if (!account) {
            setAuthMessage("Email atau password belum tepat.");
            return;
        }

        const passwordHash = await hashPassword(password, account.salt);

        if (passwordHash !== account.passwordHash) {
            setAuthMessage("Email atau password belum tepat.");
            return;
        }

        saveSession(email, remember);
        window.location.replace("index.html");
    } catch (error) {
        console.error(error);
        setAuthMessage(error.message || "Login gagal. Coba lagi.");
    }
});

setAuthMode("login");
