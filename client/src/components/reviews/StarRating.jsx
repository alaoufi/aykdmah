import { useState } from 'react';

const GOLD = '#f59e0b';
const EMPTY = '#cbd5e1';

// AYK-326 (the owner): five stars that glow. Five out of five is full and brightest; every star
// less dims the glow, and an average like 4.5 fills half of the fifth star. Empty stars stay pale.
export default function StarRating({ value = 0, onChange, size = 22, readOnly = false }) {
  const [hover, setHover] = useState(0);
  const stars = [1, 2, 3, 4, 5];
  const current = Math.max(0, Math.min(5, Number(hover || value) || 0));
  // The glow grows with the rating: none at 0, strongest at 5.
  const strength = current / 5;
  const glow = strength > 0
    ? `0 0 ${Math.round(size * 0.12 + size * 0.38 * strength)}px rgba(245, 158, 11, ${(0.2 + 0.65 * strength).toFixed(2)})`
    : 'none';
  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';

  return (
    <div className="stars" style={{ fontSize: size }} onMouseLeave={() => setHover(0)} role="img" aria-label={`${current} / 5`}>
      {stars.map(n => {
        const fill = Math.max(0, Math.min(1, current - (n - 1))); // 0, a fraction, or 1
        const partial = fill > 0 && fill < 1;
        return (
          <span
            key={n}
            data-fill={fill}
            onMouseEnter={() => !readOnly && setHover(n)}
            onClick={() => !readOnly && onChange && onChange(n)}
            style={{
              cursor: readOnly ? 'default' : 'pointer',
              transition: 'color .15s, text-shadow .15s',
              ...(partial
                ? {
                  // Part of the star in gold, from the side reading starts at.
                  backgroundImage: `linear-gradient(to ${rtl ? 'left' : 'right'}, ${GOLD} ${fill * 100}%, ${EMPTY} ${fill * 100}%)`,
                  WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', WebkitTextFillColor: 'transparent',
                  filter: `drop-shadow(${glow === 'none' ? '0 0 0 transparent' : glow.replace(/^0 0 /, '0 0 ')})`,
                }
                : { color: fill ? GOLD : EMPTY, textShadow: fill ? glow : 'none' }),
            }}
          >
            ★
          </span>
        );
      })}
    </div>
  );
}
