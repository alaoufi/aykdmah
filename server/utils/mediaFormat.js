// Inspect container structure and track kinds instead of trusting a multipart
// Content-Type. These bounded parsers do not decode or execute media bytes.
function readBoxes(buffer, start, end, state) {
  const boxes = [];
  for (let offset = start; offset < end;) {
    if (++state.count > 8192 || end - offset < 8) throw new Error('Invalid media container');
    let size = buffer.readUInt32BE(offset), header = 8;
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (size === 1) {
      if (end - offset < 16) throw new Error('Invalid media container');
      const extended = buffer.readBigUInt64BE(offset + 8);
      if (extended > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Invalid media container');
      size = Number(extended); header = 16;
    } else if (size === 0) size = end - offset;
    if (size < header || size > end - offset) throw new Error('Invalid media container');
    boxes.push({ type, start: offset + header, end: offset + size });
    offset += size;
  }
  return boxes;
}

function mp4Mime(buffer) {
  const state = { count: 0 }, top = readBoxes(buffer, 0, buffer.length, state);
  const ftyp = top.find(box => box.type === 'ftyp');
  const moov = top.find(box => box.type === 'moov');
  if (!ftyp || ftyp.end - ftyp.start < 8 || !moov
      || !top.some(box => box.type === 'mdat' && box.end > box.start)) throw new Error('Invalid media container');
  const brand = buffer.toString('ascii', ftyp.start, ftyp.start + 4);
  const tracks = [];
  for (const trak of readBoxes(buffer, moov.start, moov.end, state).filter(box => box.type === 'trak')) {
    for (const mdia of readBoxes(buffer, trak.start, trak.end, state).filter(box => box.type === 'mdia')) {
      const handler = readBoxes(buffer, mdia.start, mdia.end, state).find(box => box.type === 'hdlr');
      if (handler && handler.end - handler.start >= 12) tracks.push(buffer.toString('ascii', handler.start + 8, handler.start + 12));
    }
  }
  if (tracks.includes('vide')) return brand === 'qt  ' ? 'video/quicktime' : 'video/mp4';
  if (tracks.includes('soun')) return 'audio/mp4';
  throw new Error('Invalid media container');
}

function ebmlVint(buffer, offset, end, identifier = false) {
  if (offset >= end || !buffer[offset]) throw new Error('Invalid media container');
  let length = 1, mask = 0x80;
  while (!(buffer[offset] & mask)) { mask >>= 1; length++; }
  if (length > (identifier ? 4 : 8) || offset + length > end) throw new Error('Invalid media container');
  let value = BigInt(identifier ? buffer[offset] : buffer[offset] & (mask - 1));
  for (let i = 1; i < length; i++) value = (value << 8n) | BigInt(buffer[offset + i]);
  const unknown = !identifier && value === (1n << BigInt(7 * length)) - 1n;
  if (!unknown && value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Invalid media container');
  return { value: Number(value), length, unknown };
}

function webmMime(buffer) {
  const state = { count: 0, header: false, segment: false, docType: false, hasBlock: false, tracks: [] };
  function walk(start, end, context = '', depth = 0, track = null) {
    if (depth > 5) throw new Error('Invalid media container');
    for (let offset = start; offset < end;) {
      if (++state.count > 8192) throw new Error('Invalid media container');
      const id = ebmlVint(buffer, offset, end, true);
      const size = ebmlVint(buffer, offset + id.length, end);
      const data = offset + id.length + size.length;
      const finish = size.unknown ? end : data + size.value;
      if (finish > end || finish < data || (size.unknown && ![0x18538067, 0x1f43b675].includes(id.value))) throw new Error('Invalid media container');
      if (id.value === 0x1a45dfa3 && !context) { state.header = true; walk(data, finish, 'header', depth + 1); }
      else if (id.value === 0x4282 && context === 'header') state.docType = buffer.toString('ascii', data, finish) === 'webm';
      else if (id.value === 0x18538067 && !context) { state.segment = true; walk(data, finish, 'segment', depth + 1); }
      else if (id.value === 0x1654ae6b && context === 'segment') walk(data, finish, 'tracks', depth + 1);
      else if (id.value === 0xae && context === 'tracks') {
        if (state.tracks.length >= 32) throw new Error('Invalid media container');
        const entry = {}; state.tracks.push(entry); walk(data, finish, 'track', depth + 1, entry);
      } else if (id.value === 0x83 && context === 'track' && finish - data === 1) track.type = buffer[data];
      else if (id.value === 0x86 && context === 'track') track.codec = buffer.toString('ascii', data, finish);
      else if (id.value === 0x1f43b675 && context === 'segment') walk(data, finish, 'cluster', depth + 1);
      else if (id.value === 0xa0 && context === 'cluster') walk(data, finish, 'blockgroup', depth + 1);
      else if ((id.value === 0xa3 && context === 'cluster') || (id.value === 0xa1 && context === 'blockgroup')) {
        if (finish - data > 4) state.hasBlock = true;
      }
      offset = finish;
    }
  }
  walk(0, buffer.length);
  if (!state.header || !state.segment || !state.docType || !state.hasBlock || !state.tracks.length
      || state.tracks.some(track => !((track.type === 1 && ['V_VP8', 'V_VP9', 'V_AV1'].includes(track.codec))
        || (track.type === 2 && ['A_OPUS', 'A_VORBIS'].includes(track.codec))))) throw new Error('Invalid media container');
  return state.tracks.some(track => track.type === 1) ? 'video/webm' : 'audio/webm';
}

function oggMime(buffer) {
  let offset = 0, pages = 0, audio = false, video = false;
  while (offset < buffer.length) {
    if (++pages > 8192 || buffer.length - offset < 27 || buffer.toString('ascii', offset, offset + 4) !== 'OggS' || buffer[offset + 4] !== 0) throw new Error('Invalid media container');
    const segments = buffer[offset + 26], payload = offset + 27 + segments;
    if (payload > buffer.length) throw new Error('Invalid media container');
    let size = 0;
    for (let i = offset + 27; i < payload; i++) size += buffer[i];
    if (payload + size > buffer.length) throw new Error('Invalid media container');
    if (buffer[offset + 5] & 2) {
      const head = buffer.subarray(payload, payload + Math.min(size, 16));
      if (head.subarray(0, 8).equals(Buffer.from('OpusHead')) || head.subarray(0, 7).equals(Buffer.from('\x01vorbis'))
          || head.subarray(0, 8).equals(Buffer.from('Speex   ')) || head.subarray(0, 5).equals(Buffer.from('\x7fFLAC'))) audio = true;
      else if (head.subarray(0, 7).equals(Buffer.from('\x80theora', 'latin1'))) video = true;
      else throw new Error('Invalid media container');
    }
    offset = payload + size;
  }
  if (pages < 2 || (!audio && !video)) throw new Error('Invalid media container');
  return video ? 'video/ogg' : 'audio/ogg';
}

module.exports = { mp4Mime, webmMime, oggMime };
