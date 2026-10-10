import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { PiArrowLeftBold } from 'react-icons/pi';
import PublicNav from '@/components/layout/PublicNav';
import { Button } from '@/components/ui/button';
import { rise, stagger } from '@/lib/motion';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="min-h-dvh bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <PublicNav />
      <main className="mx-auto max-w-6xl px-5 pb-24 pt-20 sm:px-8 sm:pt-32">
        <motion.div variants={stagger(0.07)} initial="hidden" animate="show">
          <motion.p variants={rise} className="eyebrow">Error 404</motion.p>
          <motion.h1 variants={rise} className="text-hero mt-5 text-[clamp(3.5rem,10vw,8rem)] leading-[0.95]">This page is not here.</motion.h1>
          <motion.p variants={rise} className="mt-6 max-w-md text-lg text-[hsl(var(--muted-foreground))]">The link may be old, or the address may have a typo.</motion.p>
          <motion.div variants={rise} className="mt-10 flex flex-wrap gap-3">
            <Button size="lg" asChild><Link to="/">Go to the home page</Link></Button>
            <Button size="lg" variant="outline" onClick={() => navigate(-1)}><PiArrowLeftBold /> Go back</Button>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
}
