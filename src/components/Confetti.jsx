import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

const COLORS = ['#f43f5e', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#06b6d4'];

/** Lightweight CSS/framer-motion confetti burst — no external library needed. */
const Confetti = ({ count = 90 }) => {
  const pieces = useMemo(() => Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 0.5,
    duration: 2.2 + Math.random() * 1.6,
    color: COLORS[i % COLORS.length],
    rotate: (Math.random() - 0.5) * 720,
    size: 6 + Math.random() * 6,
  })), [count]);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-[200]">
      {pieces.map(p => (
        <motion.div
          key={p.id}
          initial={{ y: '-10vh', x: `${p.x}vw`, opacity: 1, rotate: 0 }}
          animate={{ y: '110vh', opacity: [1, 1, 0], rotate: p.rotate }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}
          style={{
            position: 'absolute', width: p.size, height: p.size * 1.6,
            backgroundColor: p.color, borderRadius: 2,
          }}
        />
      ))}
    </div>
  );
};

export default Confetti;
