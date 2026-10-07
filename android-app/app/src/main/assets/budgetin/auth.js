// ========================================
// BUDGETIN AUTH
// ========================================

function getActiveSession() {
    const sessionKey = "budgetin_session";
    const rawSession = sessionStorage.getItem(sessionKey) ||
        localStorage.getItem(sessionKey);

    try {
        const session = JSON.parse(rawSession);

        if (!session?.email || Number(session.expiresAt) <= Date.now()) {
            sessionStorage.removeItem(sessionKey);
            localStorage.removeItem(sessionKey);
            return null;
        }

        return session;
    } catch (error) {
        return null;
    }
}

function checkLogin() {
    if (!getActiveSession()) {
        window.location.replace("login.html");
    }
}


// Jalankan pengecekan
checkLogin();
