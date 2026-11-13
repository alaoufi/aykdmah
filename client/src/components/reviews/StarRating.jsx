import { useState } from 'react';

export default function StarRating({ value = 0, onChange, size = 22, readOnly = false }) {
  const [hover, setHover] = useState(0);
  const stars = [1, 2, 3, 4, 5];
  const current = hover || value;

  return (
    <div className="stars" style={{ fontSize: size }} onMouseLeave={() => setHover(0)}>
      {stars.map(n => (
        <span
          key={n}
          onMouseEnter={() => !readOnly && setHover(n)}
          onClick={() => !readOnly && onChange && onChange(n)}
          style={{ cursor: readOnly ? 'default' : 'pointer', color: n <= current ? '#f59e0b' : '#cbd5e1' }}
        >
          ★
        </span>
      ))}
    </div>
  );
}
