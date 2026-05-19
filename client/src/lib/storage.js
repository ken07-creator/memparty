export function randomLocalId() {
  return `local_${Math.random().toString(36).slice(2, 10)}`;
}

export function loadProfile() {
  try {
    const raw = localStorage.getItem("memparty_profile");
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return parsed;
  } catch {
    return null;
  }
}

export function saveProfile(profile) {
  localStorage.setItem("memparty_profile", JSON.stringify(profile));
}

export function loadSession() {
  try {
    const raw = localStorage.getItem("memparty_session");
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveSession(session) {
  localStorage.setItem("memparty_session", JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem("memparty_session");
}