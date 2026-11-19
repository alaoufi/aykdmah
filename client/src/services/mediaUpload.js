import api from './api';
import { setChatMediaLimits } from '../utils/chatMedia';

// AYK-248: the owner's media limits, and whether files go from the phone straight to R2.
let limitsRequest = null;
export function loadMediaLimits() {
  limitsRequest ||= api.get('/media/limits')
    .then(({ data }) => { setChatMediaLimits(data.data); return data.data; })
    .catch(() => { limitsRequest = null; setChatMediaLimits(null); return { direct: false }; });
  return limitsRequest;
}

// One file into one conversation: a signed ticket from the server, then the bytes go straight
// to R2 with the exact type and size the ticket was signed for. Returns the media id the message
// is sent with. onProgress(0..1) follows the upload.
export async function uploadChatFile(conversationId, file, { durationSeconds, onProgress } = {}) {
  const type = String(file.type || '').split(';')[0].trim().toLowerCase();
  const { data } = await api.post('/media/uploads', {
    conversation_id: conversationId, file_name: file.name, type, size: file.size,
    ...(durationSeconds ? { duration_seconds: durationSeconds } : {}),
  });
  const ticket = data.data;
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', ticket.upload_url);
    for (const [name, value] of Object.entries(ticket.headers || {})) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress?.(event.loaded / event.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(Object.assign(new Error('upload failed'), { status: xhr.status })));
    xhr.onerror = () => reject(new Error('upload failed'));
    xhr.ontimeout = () => reject(new Error('upload timed out'));
    xhr.timeout = 15 * 60 * 1000;
    xhr.send(file);
  });
  onProgress?.(1);
  return ticket.media_id;
}
