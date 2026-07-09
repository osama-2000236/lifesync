// Helpers for cloud-TTS <audio> elements that hold blob: URLs.
// Barge-in / stop must revoke the object URL or each interrupted chunk leaks.

export const attachBlobUrl = (audio, url) => {
  if (audio) audio.__lifesyncBlobUrl = url;
  return audio;
};

export const revokeAudioBlob = (audio) => {
  const url = audio?.__lifesyncBlobUrl;
  if (!url) return;
  try { URL.revokeObjectURL(url); } catch { /* ignore */ }
  try { audio.__lifesyncBlobUrl = null; } catch { /* ignore */ }
};

/** Pause playback and free the blob URL (barge-in / stop / cleanup). */
export const stopAndRevokeAudio = (audio) => {
  if (!audio) return;
  try { audio.pause(); } catch { /* ignore */ }
  try { audio.src = ''; } catch { /* ignore */ }
  revokeAudioBlob(audio);
};
