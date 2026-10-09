import { useEffect } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';

/**
 * A number that counts up (or down) to its value instead of jumping.
 * The digits are tabular so the width does not shake while it runs.
 *
 * @param value    where it ends
 * @param from     where it starts
 * @param delay    seconds to wait first, so rewards can arrive one after another
 * @param format   how to print each frame, default is a rounded number with separators
 */
export default function AnimatedNumber({ value, from = 0, duration = 0.9, delay = 0, format, className = '' }) {
  const motionValue = useMotionValue(from);
  const text = useTransform(motionValue, (n) => (format ? format(n) : Math.round(n).toLocaleString()));

  useEffect(() => {
    const controls = animate(motionValue, value, { duration, delay, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [value, duration, delay, motionValue]);

  return <motion.span className={`tabular ${className}`}>{text}</motion.span>;
}
