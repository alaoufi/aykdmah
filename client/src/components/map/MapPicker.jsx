import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

const fixIcon = () => {
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
};

function MapClicker({ onPick }) {
  useMapEvents({
    click(e) { onPick({ latitude: e.latlng.lat, longitude: e.latlng.lng }); },
  });
  return null;
}

function MapView({ center }) {
  const map = useMap();
  useEffect(() => { if (center) map.setView([center.latitude, center.longitude], map.getZoom() || 13); }, [center, map]);
  return null;
}

export default function MapPicker({ value, onChange, height = 320, defaultCenter }) {
  useEffect(() => { fixIcon(); }, []);
  const [position] = useState(value || defaultCenter || { latitude: 24.7136, longitude: 46.6753 });

  return (
    <div style={{ height, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
      <MapContainer center={[position.latitude, position.longitude]} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {value && <Marker position={[value.latitude, value.longitude]} />}
        {onChange && <MapClicker onPick={onChange} />}
        {value && <MapView center={value} />}
      </MapContainer>
    </div>
  );
}
