import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, ArrowLeft, FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';

const NotFound = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen w-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] flex items-center justify-center p-8 relative overflow-hidden">
      {/* Decorative background grid and blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] bg-[linear-gradient(to_right,hsl(var(--foreground))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--foreground))_1px,transparent_1px)] bg-[size:3rem_3rem]" />
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-[hsl(var(--primary))]/10 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-[hsl(var(--primary))]/5 blur-[120px]" />
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-[hsl(var(--primary))]/10 mx-auto mb-6 flex items-center justify-center text-[hsl(var(--primary))] border border-[hsl(var(--primary))]/20 shadow-sm">
          <FileQuestion className="w-8 h-8" />
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight mb-2 text-[hsl(var(--primary))]">404</h1>
        <h2 className="text-xl font-bold mb-2 text-[hsl(var(--foreground))]">Page Not Found</h2>
        <p className="text-xs text-[hsl(var(--muted-foreground))] mb-6">Looks like this page doesn't exist or was moved.</p>
        <div className="flex gap-3 justify-center">
          <Button onClick={() => navigate(-1)} variant="outline"
            className="gap-2 border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]/80 cursor-pointer">
            <ArrowLeft className="w-4 h-4 text-[hsl(var(--muted-foreground))]" /> Go Back
          </Button>
          <Link to="/">
            <Button className="gap-2 bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/90 text-[hsl(var(--primary-foreground))] border-0 cursor-pointer font-semibold">
              <Home className="w-4 h-4" /> Home
            </Button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
};

export default NotFound;
