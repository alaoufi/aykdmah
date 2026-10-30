// Reads WebRTC statistics of a LiveKit room for the call quality log (AYK-060): the path the
// media took, round trip, jitter, packet loss and how much audio/video actually arrived.
// Numbers only; never any media.
export async function collectCallStats(room) {
  const summary = {
    device: navigator.userAgent.slice(0, 160),
    network_type: navigator.connection?.effectiveType || null,
  };
  const reports = [];
  const tracks = [];
  for (const participant of room.remoteParticipants.values()) {
    for (const pub of participant.trackPublications.values()) if (pub.track) tracks.push(pub.track);
  }
  for (const pub of room.localParticipant.trackPublications.values()) if (pub.track) tracks.push(pub.track);
  for (const track of tracks) {
    try {
      // Straight from the sender or receiver when the library returns nothing (Android: AYK-093).
      let report = await track.getRTCStatsReport?.();
      if (!report || !report.size) report = await (track.receiver || track.sender)?.getStats?.();
      if (report) reports.push(report);
    } catch (_) { /* track already stopped */ }
  }
  let lost = 0, received = 0, jitter = [], audioIn = 0, audioOut = 0, videoIn = 0;
  for (const report of reports) {
    const byId = new Map(); report.forEach(entry => byId.set(entry.id, entry));
    report.forEach(entry => {
      if (entry.type === 'inbound-rtp') {
        lost += entry.packetsLost || 0; received += entry.packetsReceived || 0;
        if (entry.kind === 'audio') { audioIn += entry.bytesReceived || 0; if (entry.jitter != null) jitter.push(entry.jitter); }
        if (entry.kind === 'video') videoIn += entry.bytesReceived || 0;
      }
      if (entry.type === 'outbound-rtp' && entry.kind === 'audio') audioOut += entry.bytesSent || 0;
      if (entry.type === 'candidate-pair' && (entry.nominated || entry.selected) && entry.state === 'succeeded') {
        if (entry.currentRoundTripTime != null) summary.rtt_ms = Math.round(entry.currentRoundTripTime * 1000);
        const local = byId.get(entry.localCandidateId);
        if (local) {
          summary.connection_type = local.candidateType === 'relay'
            ? `relay-${local.relayProtocol === 'tls' ? 'tls' : local.relayProtocol === 'tcp' ? 'tcp' : 'udp'}`
            : (local.protocol === 'tcp' ? 'tcp' : 'udp');
        }
      }
    });
  }
  if (lost + received > 0) summary.packet_loss_pct = Math.round((lost / (lost + received)) * 10000) / 100;
  if (jitter.length) summary.jitter_ms = Math.round((jitter.reduce((a, b) => a + b, 0) / jitter.length) * 1000);
  summary.audio_kb_in = Math.round(audioIn / 1024);
  summary.audio_kb_out = Math.round(audioOut / 1024);
  summary.video_kb_in = Math.round(videoIn / 1024);
  return summary;
}
