// Profile photo storage. File picks are stored per-user in localStorage until a
// real server upload lands (avatar_url is STRING(500) and can't hold data URLs).
// Remote https URLs still go through PUT /auth/me as today.
// ponytail: swap setLocalAvatar → FormData upload when the server is ready.

const storageKey = (userId) => `lifesync.avatar.${userId}`;

export const getLocalAvatar = (userId) => {
  if (userId == null) return null;
  try {
    return localStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }
};

export const setLocalAvatar = (userId, dataUrl) => {
  if (userId == null) return;
  try {
    if (!dataUrl) localStorage.removeItem(storageKey(userId));
    else localStorage.setItem(storageKey(userId), dataUrl);
  } catch {
    /* quota / private mode — caller shows a soft error */
  }
};

export const clearLocalAvatar = (userId) => setLocalAvatar(userId, null);

/** Local file (if any) wins over server avatar_url. */
export const resolveAvatarUrl = (user) => {
  if (!user) return null;
  return getLocalAvatar(user.id) || user.avatar_url || null;
};

/** Short remote URLs fit the current DB column; data: URLs do not. */
export const isRemoteAvatarUrl = (value) => (
  typeof value === 'string'
  && /^https?:\/\//i.test(value.trim())
  && value.trim().length <= 500
);

/**
 * Resize + JPEG-compress a picked image for avatar use.
 * @returns {Promise<string>} data URL
 */
export const compressImageFile = (file, { maxSide = 256, quality = 0.82 } = {}) => (
  new Promise((resolve, reject) => {
    if (!file || !String(file.type || '').startsWith('image/')) {
      reject(Object.assign(new Error('NOT_IMAGE'), { code: 'NOT_IMAGE' }));
      return;
    }
    // 8 MB pre-compress ceiling — after compress we stay well under localStorage limits.
    if (file.size > 8 * 1024 * 1024) {
      reject(Object.assign(new Error('TOO_LARGE'), { code: 'TOO_LARGE' }));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        const scale = Math.min(1, maxSide / Math.max(width, height || 1));
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw Object.assign(new Error('NO_CANVAS'), { code: 'LOAD_FAILED' });
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        URL.revokeObjectURL(objectUrl);
        resolve(dataUrl);
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(Object.assign(new Error('LOAD_FAILED'), { code: 'LOAD_FAILED' }));
    };
    img.src = objectUrl;
  })
);
